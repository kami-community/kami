import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/lib/db/client";
import { fakeDb } from "@/lib/testing/fakeDb";

const state: { db: Db | null } = { db: null };
vi.mock("@/lib/db/client", () => ({ dbOrNull: () => state.db }));

const { finishAgentRun, logAgentRun, startAgentRun, trackAgentRun } = await import("./agentRunLog");

const SESSION = "6f1c1d0e-2a51-4f6b-9a8e-0d1f0c9b7a11";
const base = {
  sessionId: SESSION,
  source: "hermes_once" as const,
  kind: "sales_plan",
  agent: "sales-strategist",
  input: "plan this",
};

type Row = Record<string, unknown>;

describe("agent run logging", () => {
  let tables: Record<string, Row[]>;
  beforeEach(() => {
    const fake = fakeDb({ agent_run_logs: [] });
    state.db = fake.db;
    tables = fake.tables;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("writes a running row at start and updates the same row at the end", async () => {
    const run = trackAgentRun(base);
    const id = await run.started;
    expect(tables.agent_run_logs).toHaveLength(1);
    expect(tables.agent_run_logs[0]).toMatchObject({ id, status: "running", duration_ms: null });

    run.finish({ status: "ok", outputText: "done", durationMs: 1200 });
    await vi.waitFor(() => expect(tables.agent_run_logs[0].status).toBe("ok"));
    expect(tables.agent_run_logs).toHaveLength(1);
    expect(tables.agent_run_logs[0]).toMatchObject({ output_text: "done", duration_ms: 1200 });
    expect(tables.agent_run_logs[0].meta).toMatchObject({ live: true });
  });

  it("only finishes once", async () => {
    const run = trackAgentRun(base);
    run.finish({ status: "error", error: "boom", durationMs: 5 });
    run.finish({ status: "ok", outputText: "late", durationMs: 9 });
    await vi.waitFor(() => expect(tables.agent_run_logs[0].status).toBe("error"));
    await new Promise((r) => setTimeout(r, 10));
    expect(tables.agent_run_logs[0].status).toBe("error");
  });

  it("falls back to one finished row when the start insert failed", async () => {
    const fake = fakeDb(
      { agent_run_logs: [] },
      { onInsert: (_t, row) => (row.status === "running" ? "57014" : null) },
    );
    state.db = fake.db;
    const run = trackAgentRun(base);
    expect(await run.started).toBeNull();
    run.finish({ status: "timeout", error: "timed out", durationMs: 90_000 });
    await vi.waitFor(() => expect(fake.tables.agent_run_logs).toHaveLength(1));
    expect(fake.tables.agent_run_logs[0]).toMatchObject({ status: "timeout", duration_ms: 90_000 });
  });

  it("inserts the finished run when the running row has gone", async () => {
    await finishAgentRun("00000000-0000-4000-8000-000000000000", base, {
      status: "ok",
      outputText: "x",
      durationMs: 3,
    });
    expect(tables.agent_run_logs).toHaveLength(1);
    expect(tables.agent_run_logs[0].status).toBe("ok");
  });

  it("never throws when Supabase is not configured", async () => {
    state.db = null;
    expect(await startAgentRun(base)).toBeNull();
    expect(await logAgentRun(base)).toBeNull();
    await expect(
      finishAgentRun(null, base, { status: "ok", durationMs: 1 }),
    ).resolves.toBeUndefined();
  });

  it("never throws when the database client itself throws", async () => {
    state.db = {
      from() {
        throw new Error("socket closed");
      },
    } as unknown as Db;
    const run = trackAgentRun(base);
    expect(await run.started).toBeNull();
    expect(() => run.finish({ status: "ok", durationMs: 1 })).not.toThrow();
  });
});
