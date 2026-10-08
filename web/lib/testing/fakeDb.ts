import { randomUUID } from "node:crypto";
import type { Db } from "@/lib/db/client";

/**
 * Minimal in-memory stand-in for the Supabase query builder, for service tests.
 * Supports the subset Kami services use: select/insert/update/delete with
 * eq, in, not(col, "is", null), lt, or("a.eq.x,and(b.eq.y,c.lt.\"z\")"),
 * order, limit, single, maybeSingle. Column lists in select() are ignored.
 */

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export interface FakeDbOptions {
  /** Return a Postgres error code (e.g. "23505") to reject an insert. */
  onInsert?: (table: string, row: Row, rows: Row[]) => string | null;
}

function compare(op: string, actual: unknown, expected: string): boolean {
  const a = actual == null ? null : String(actual);
  switch (op) {
    case "eq":
      return a === expected;
    case "neq":
      return a !== expected;
    case "lt":
      return a !== null && a < expected;
    case "gt":
      return a !== null && a > expected;
    case "is":
      return expected === "null" ? actual == null : String(actual) === expected;
    default:
      throw new Error(`fakeDb: unsupported operator ${op}`);
  }
}

function splitTopLevel(expr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = "";
  for (const ch of expr) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === "(") depth++;
    if (!quoted && ch === ")") depth--;
    if (!quoted && depth === 0 && ch === ",") {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  if (current) parts.push(current);
  return parts;
}

function parseCondition(expr: string): Filter {
  const nested = expr.match(/^(and|or)\((.*)\)$/);
  if (nested) {
    const parts = splitTopLevel(nested[2]).map(parseCondition);
    return nested[1] === "and"
      ? (row) => parts.every((p) => p(row))
      : (row) => parts.some((p) => p(row));
  }
  const [column, op, ...rest] = expr.split(".");
  const value = rest.join(".").replace(/^"(.*)"$/, "$1");
  return (row) => compare(op, row[column], value);
}

class Query implements PromiseLike<{
  data: unknown;
  error: { code?: string; message: string } | null;
}> {
  private filters: Filter[] = [];
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private singleMode: "one" | "maybe" | null = null;
  private limitN: number | null = null;
  private orderBy: { column: string; ascending: boolean } | null = null;

  constructor(
    private readonly tables: Record<string, Row[]>,
    private readonly table: string,
    private readonly options: FakeDbOptions,
  ) {}

  select() {
    return this;
  }
  insert(payload: Row | Row[]) {
    this.mode = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.mode = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }
  lt(column: string, value: string) {
    this.filters.push((row) => compare("lt", row[column], value));
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }
  not(column: string, op: string, value: unknown) {
    this.filters.push((row) => !compare(op, row[column], String(value)));
    return this;
  }
  or(expr: string) {
    this.filters.push(parseCondition(`or(${expr})`));
    return this;
  }
  order(column: string, opts: { ascending?: boolean } = {}) {
    this.orderBy = { column, ascending: opts.ascending ?? true };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }
  single() {
    this.singleMode = "one";
    return this;
  }

  private rows(): Row[] {
    return (this.tables[this.table] ??= []);
  }

  private execute(): { data: unknown; error: { code?: string; message: string } | null } {
    const rows = this.rows();
    let result: Row[];
    if (this.mode === "insert") {
      const inserts = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((r) => ({
        id: randomUUID(),
        created_at: new Date().toISOString(),
        ...r,
      }));
      for (const r of inserts) {
        const code = this.options.onInsert?.(this.table, r, rows) ?? null;
        if (code) return { data: null, error: { code, message: `insert rejected (${code})` } };
      }
      rows.push(...inserts);
      result = inserts;
    } else {
      result = rows.filter((r) => this.filters.every((f) => f(r)));
      if (this.mode === "update") for (const r of result) Object.assign(r, this.payload);
      if (this.mode === "delete") this.tables[this.table] = rows.filter((r) => !result.includes(r));
    }
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      result = [...result].sort((a, b) =>
        String(a[column]) < String(b[column]) ? (ascending ? -1 : 1) : ascending ? 1 : -1,
      );
    }
    if (this.limitN !== null) result = result.slice(0, this.limitN);
    const copy = result.map((r) => ({ ...r }));
    if (this.singleMode === "maybe") return { data: copy[0] ?? null, error: null };
    if (this.singleMode === "one") {
      return copy.length === 1
        ? { data: copy[0], error: null }
        : {
            data: null,
            error: { code: "PGRST116", message: `expected 1 row, got ${copy.length}` },
          };
    }
    return { data: copy, error: null };
  }

  then<R1, R2>(
    onfulfilled?: (value: {
      data: unknown;
      error: { code?: string; message: string } | null;
    }) => R1 | PromiseLike<R1>,
    onrejected?: (reason: unknown) => R2 | PromiseLike<R2>,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

export function fakeDb(seed: Record<string, Row[]> = {}, options: FakeDbOptions = {}) {
  const tables: Record<string, Row[]> = structuredClone(seed);
  const db = {
    from(table: string) {
      return new Query(tables, table, options);
    },
  };
  return { db: db as unknown as Db, tables };
}
