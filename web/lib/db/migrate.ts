import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { env } from "@/lib/config/env";

/**
 * Applies web/supabase/migrations in order.
 *
 * Fresh database: create every table.
 * Database that already has the current shape: record that and leave the data.
 * Database left mid-way through the old 001–018 files: stop, and do not rewrite it.
 */

const LOCKDOWN_MARKER = "-- kami:lockdown";
const FILE_NAME = /^(\d{3}_[a-z0-9_]+)\.sql$/;
const VERSION = /^\d{3}_[a-z0-9_]+$/;
const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

const LEDGER = `
create table if not exists kami_schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
`;

export interface Sql {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
  exec(text: string): Promise<void>;
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
}

export interface MigrationFile {
  version: string;
  sql: string;
}

export interface MigrateResult {
  applied: string[];
  skipped?: undefined;
}

export interface MigrateSkipped {
  applied?: undefined;
  skipped: true;
}

/** Local Supabase CLI (`supabase start`) publishes Postgres on 54322. */
export function resolveDatabaseUrl(input: {
  databaseUrl?: string;
  supabaseUrl?: string;
}): string | undefined {
  if (input.databaseUrl) return input.databaseUrl;
  if (!input.supabaseUrl) return undefined;
  try {
    const host = new URL(input.supabaseUrl).hostname;
    if (host === "localhost" || host === "127.0.0.1") return LOCAL_DATABASE_URL;
  } catch {
    return undefined;
  }
  return undefined;
}

export function migrationsDir(): string {
  return join(process.cwd(), "supabase", "migrations");
}

export function readMigrations(dir: string): MigrationFile[] {
  return readdirSync(dir)
    .filter((name) => FILE_NAME.test(name))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map((name) => ({
      version: name.slice(0, -".sql".length),
      sql: readFileSync(join(dir, name), "utf8"),
    }));
}

type Shape = "empty" | "current" | "legacy";

/** `current` means the pre-squash migrations 001–018 already produced this schema. */
async function shape(db: Sql): Promise<Shape> {
  const [row] = await db.query<{ has_sessions: boolean; current: boolean }>(`
    select
      to_regclass('public.agent_sessions') is not null as has_sessions,
      (
        to_regclass('public.outbound_receipts') is not null
        and exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'agent_sessions'
            and column_name = 'dossier_confirmed_at'
        )
        and exists (
          select 1 from information_schema.columns
          where table_schema = 'public'
            and table_name = 'boost_campaigns'
            and column_name = 'x_campaign_id'
        )
      ) as current
  `);
  if (!row?.has_sessions) return "empty";
  if (row.current) return "current";
  return "legacy";
}

/** RLS and grants, re-applied after every run so tables added later stay locked down. */
function lockdownFrom(files: MigrationFile[]): string | null {
  const schema = files.find((file) => file.version === "001_schema");
  const at = schema?.sql.indexOf(LOCKDOWN_MARKER) ?? -1;
  if (!schema || at < 0) return null;
  return schema.sql.slice(at);
}

async function applyLockdown(db: Sql, files: MigrationFile[]): Promise<void> {
  const sql = lockdownFrom(files);
  if (sql) await db.exec(sql);
}

function assertVersion(version: string): void {
  if (!VERSION.test(version)) throw new Error(`invalid migration version: ${version}`);
}

async function record(db: Sql, version: string): Promise<void> {
  assertVersion(version);
  await db.exec(
    `insert into kami_schema_migrations (version) values ('${version}') on conflict (version) do nothing`,
  );
}

async function runFile(db: Sql, file: MigrationFile): Promise<void> {
  assertVersion(file.version);
  await db.transaction(async (tx) => {
    await tx.exec(file.sql);
    await record(tx, file.version);
  });
}

/** Apply any migration file not yet recorded. Holds a session advisory lock. */
export async function applyMigrations(db: Sql, files: MigrationFile[]): Promise<string[]> {
  await db.exec("select pg_advisory_lock(824114)");
  try {
    await db.exec(LEDGER);
    const applied = new Set(
      (await db.query<{ version: string }>("select version from kami_schema_migrations")).map(
        (row) => row.version,
      ),
    );
    const pending = files.filter((file) => !applied.has(file.version));
    if (pending.length === 0) {
      await applyLockdown(db, files);
      return [];
    }

    const done: string[] = [];
    const baseline = pending.find((file) => file.version === "001_schema");
    const rest = pending.filter((file) => file.version !== "001_schema");

    if (baseline) {
      const state = await shape(db);
      if (state === "legacy") {
        throw new Error(
          "This database has Kami tables from an older migration set. Kami will not change it. Use a new Supabase project, or an empty public schema, then start the app again.",
        );
      }
      if (state === "current") {
        await record(db, baseline.version);
      } else {
        await runFile(db, baseline);
      }
      done.push(baseline.version);
    }

    for (const file of rest) {
      await runFile(db, file);
      done.push(file.version);
    }
    await applyLockdown(db, files);
    return done;
  } finally {
    await db.exec("select pg_advisory_unlock(824114)");
  }
}

function databaseHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "database";
  }
}

function wrap(sql: postgres.Sql | postgres.TransactionSql): Sql {
  return {
    async query<T extends Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> {
      const rows = await sql.unsafe(text, (params ?? []) as never[]);
      return rows as unknown as T[];
    },
    async exec(text) {
      await sql.unsafe(text);
    },
    async transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T> {
      if (!("begin" in sql)) throw new Error("nested transactions are not used");
      const result = await sql.begin(async (tx) => fn(wrap(tx)));
      return result as T;
    },
  };
}

async function withDatabase<T>(url: string, fn: (db: Sql) => Promise<T>): Promise<T> {
  const sql = postgres(url, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    onnotice: () => {},
  });
  try {
    return await fn(wrap(sql));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** Create missing tables. No-ops when Supabase is not configured with a Postgres URL. */
export async function migrateOnStartup(): Promise<MigrateResult | MigrateSkipped> {
  const url = resolveDatabaseUrl({
    databaseUrl: env().DATABASE_URL,
    supabaseUrl: env().NEXT_PUBLIC_SUPABASE_URL,
  });
  if (!url) {
    if (env().NEXT_PUBLIC_SUPABASE_URL) {
      console.info(
        "Database schema was not migrated. Set DATABASE_URL to the Postgres connection string so tables are created on startup.",
      );
    }
    return { skipped: true };
  }

  try {
    const applied = await withDatabase(url, (db) =>
      applyMigrations(db, readMigrations(migrationsDir())),
    );
    if (applied.length > 0) console.info(`Database schema applied: ${applied.join(", ")}`);
    return { applied };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Database migration failed (${databaseHost(url)}): ${message}`);
  }
}
