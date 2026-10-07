import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";
import { resetEnvForTests } from "@/lib/config/env";
import {
  applyMigrations,
  migrationsDir,
  readMigrations,
  resolveDatabaseUrl,
  type Sql,
} from "./migrate";

function fromPglite(pg: PGlite): Sql {
  return {
    async query<T extends Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> {
      const result = await pg.query<T>(text, params);
      return result.rows;
    },
    async exec(text) {
      await pg.exec(text);
    },
    async transaction(fn) {
      return pg.transaction(async (tx) => fn(fromPglite(tx as unknown as PGlite)));
    },
  };
}

async function database(): Promise<{ pg: PGlite; sql: Sql }> {
  const pg = new PGlite();
  return { pg, sql: fromPglite(pg) };
}

describe("resolveDatabaseUrl", () => {
  afterEach(() => resetEnvForTests());

  it("prefers DATABASE_URL", () => {
    expect(
      resolveDatabaseUrl({
        databaseUrl: "postgresql://db.example/kami",
        supabaseUrl: "http://127.0.0.1:54321",
      }),
    ).toBe("postgresql://db.example/kami");
  });

  it("uses the local Supabase port when the API is on localhost", () => {
    expect(resolveDatabaseUrl({ supabaseUrl: "http://127.0.0.1:54321" })).toBe(
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    );
  });

  it("does not guess a URL for a hosted project", () => {
    expect(resolveDatabaseUrl({ supabaseUrl: "https://abc.supabase.co" })).toBeUndefined();
  });
});

describe("applyMigrations", () => {
  const files = readMigrations(migrationsDir());

  it("creates the schema on an empty database and does not apply it twice", async () => {
    const { pg, sql } = await database();
    const first = await applyMigrations(sql, files);
    expect(first).toEqual(["001_schema"]);

    const tables = await pg.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public' order by 1",
    );
    const names = tables.rows.map((row) => row.tablename);
    expect(names).toContain("agent_sessions");
    expect(names).toContain("outbound_receipts");
    expect(names).toContain("brand_profiles");
    expect(names).not.toContain("contacts");
    expect(names).not.toContain("opportunities");

    const locked = await pg.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class where relname = 'agent_sessions'",
    );
    expect(locked.rows[0].relrowsecurity).toBe(true);

    const session = await pg.query<{ id: string }>(
      "insert into agent_sessions (domain) values ('example.com') returning id",
    );
    const sessionId = session.rows[0].id;
    await expect(
      pg.exec(`
        insert into outbound_receipts (
          session_id, channel, idempotency_key, status, subject_type, subject_id, provider, content
        ) values (
          '${sessionId}', 'email', 'k1', 'sent', 'sales_touchpoint', gen_random_uuid(), 'agentmail', 'hi'
        )
      `),
    ).rejects.toThrow();

    await pg.exec(`
      insert into suppressions (identifier, reason, source)
      values ('founder@example.com', 'unsubscribed', 'user')
    `);
    await expect(
      pg.exec(`
        insert into suppressions (identifier, reason, source)
        values ('founder@example.com', 'again', 'user')
      `),
    ).rejects.toThrow();

    expect(await applyMigrations(sql, files)).toEqual([]);
    await pg.close();
  });

  it("records an existing current database without recreating tables", async () => {
    const { pg, sql } = await database();
    await pg.exec(`
      create table agent_sessions (
        id uuid primary key,
        dossier_confirmed_at timestamptz,
        kept text
      );
      create table outbound_receipts (id uuid primary key);
      create table boost_campaigns (id uuid primary key, x_campaign_id text);
    `);
    expect(await applyMigrations(sql, files)).toEqual(["001_schema"]);
    const columns = await pg.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_name = 'agent_sessions' order by 1`,
    );
    expect(columns.rows.map((row) => row.column_name)).toEqual([
      "dossier_confirmed_at",
      "id",
      "kept",
    ]);
    expect(await applyMigrations(sql, files)).toEqual([]);
    await pg.close();
  });

  it("refuses a database stuck on the old migration history", async () => {
    const { pg, sql } = await database();
    await pg.exec("create table agent_sessions (id uuid primary key, domain text)");
    await expect(applyMigrations(sql, files)).rejects.toThrow(/older migration set/);
    const versions = await pg.query("select version from kami_schema_migrations");
    expect(versions.rows).toEqual([]);
    await pg.close();
  });

  it("applies a later file after the baseline", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kami-migrations-"));
    writeFileSync(join(dir, "001_schema.sql"), "create table kami_probe (id int primary key);\n");
    writeFileSync(join(dir, "002_extra.sql"), "create table kami_extra (id int primary key);\n");
    const { pg, sql } = await database();
    expect(await applyMigrations(sql, readMigrations(dir))).toEqual(["001_schema", "002_extra"]);
    const tables = await pg.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    expect(tables.rows.map((row) => row.tablename).sort()).toEqual([
      "kami_extra",
      "kami_probe",
      "kami_schema_migrations",
    ]);
    await pg.close();
  });
});
