import { describe, expect, it } from "vitest";
import { fakeDb } from "@/lib/testing/fakeDb";
import { buildRoster } from "./agents";
import { kindLabel } from "./labels";
import { liveRuns, listRuns, summarizeRun, type StoredRun } from "./runs";

const SESSION = "6f1c1d0e-2a51-4f6b-9a8e-0d1f0c9b7a11";
const OTHER = "0b8e1f2c-3d4a-4b5c-8d6e-7f8091a2b3c4";
const NOW = Date.parse("2026-10-06T12:00:00.000Z");
const TIMEOUT = 90_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

function stored(
  extra: Partial<StoredRun> & { id: string },
): StoredRun & { session_id: string; [key: string]: unknown } {
  return {
    session_id: SESSION,
    agent: "sales-strategist",
    kind: "sales_plan",
    source: "hermes_once",
    status: "ok",
    duration_ms: 1_000,
    error: null,
    created_at: ago(60_000),
    meta: { live: true },
    ...extra,
  };
}

describe("summarizeRun", () => {
  it("keeps a recent running row running", () => {
    const run = summarizeRun(
      stored({ id: "a", status: "running", duration_ms: null, created_at: ago(5_000) }),
      NOW,
      TIMEOUT,
    );
    expect(run).toMatchObject({
      status: "running",
      duration_ms: null,
      finished_at: null,
      started_at: ago(5_000),
    });
  });

  it("reports a running row past its timeout plus margin as stale", () => {
    const old = ago(TIMEOUT * 3 + 61_000);
    const run = summarizeRun(
      stored({ id: "a", status: "running", duration_ms: null, created_at: old }),
      NOW,
      TIMEOUT,
    );
    expect(run.status).toBe("stale");
    expect(run.error).toMatch(/never reported back/);
  });

  it("honours a longer per-run timeout before calling it stale", () => {
    const row = stored({
      id: "a",
      status: "running",
      duration_ms: null,
      created_at: ago(TIMEOUT * 3 + 61_000),
      meta: { live: true, timeout_ms: 600_000 },
    });
    expect(summarizeRun(row, NOW, TIMEOUT).status).toBe("running");
  });

  it("derives the start of runs logged only when they ended", () => {
    const run = summarizeRun(
      stored({ id: "a", created_at: ago(1_000), duration_ms: 4_000, meta: {} }),
      NOW,
      TIMEOUT,
    );
    expect(run.started_at).toBe(ago(5_000));
    expect(run.finished_at).toBe(ago(1_000));
  });

  it("labels agents and tasks in plain language", () => {
    const run = summarizeRun(stored({ id: "a", kind: "sales_plan_retry" }), NOW, TIMEOUT);
    expect(run.agent_label).toBe("Sales strategist");
    expect(run.task).toBe("Writing the sales plan (correcting)");
    expect(kindLabel("something_new")).toBe("Something new");
  });
});

describe("liveRuns", () => {
  it("splits running from recent, moves stale runs to recent, and stays in its campaign", async () => {
    const { db } = fakeDb({
      agent_run_logs: [
        stored({ id: "live", status: "running", duration_ms: null, created_at: ago(3_000) }),
        stored({ id: "dead", status: "running", duration_ms: null, created_at: ago(3_600_000) }),
        stored({ id: "done", status: "ok", created_at: ago(10_000) }),
        stored({ id: "failed", status: "error", created_at: ago(20_000), error: "boom" }),
        {
          ...stored({
            id: "elsewhere",
            status: "running",
            duration_ms: null,
            created_at: ago(1_000),
          }),
          session_id: OTHER,
        },
      ],
    });
    const live = await liveRuns(db, SESSION, 8, NOW);
    expect(live.now).toBe(new Date(NOW).toISOString());
    expect(live.running.map((r) => r.id)).toEqual(["live"]);
    expect(live.recent.map((r) => [r.id, r.status])).toEqual([
      ["done", "ok"],
      ["failed", "error"],
      ["dead", "stale"],
    ]);
  });
});

describe("listRuns", () => {
  it("filters by agent", async () => {
    const { db } = fakeDb({
      agent_run_logs: [
        stored({ id: "a" }),
        stored({ id: "b", agent: "outreach", kind: "sales_drafts" }),
      ],
    });
    const runs = await listRuns(db, SESSION, { agent: "outreach", limit: 50 }, NOW);
    expect(runs.map((r) => r.id)).toEqual(["b"]);
    expect(runs[0].task).toBe("Drafting outreach emails");
  });
});

describe("buildRoster", () => {
  it("joins the registry with run statistics", () => {
    const runs = [
      summarizeRun(
        stored({ id: "1", status: "running", duration_ms: null, created_at: ago(2_000) }),
        NOW,
        TIMEOUT,
      ),
      summarizeRun(stored({ id: "2", status: "ok", created_at: ago(60_000) }), NOW, TIMEOUT),
      summarizeRun(stored({ id: "3", status: "timeout", created_at: ago(120_000) }), NOW, TIMEOUT),
      summarizeRun(stored({ id: "4", status: "ok", created_at: ago(180_000) }), NOW, TIMEOUT),
      summarizeRun(
        stored({ id: "5", agent: "discovery", kind: "sales_discover", source: "pipeline" }),
        NOW,
        TIMEOUT,
      ),
    ];
    const roster = buildRoster(
      { "sales-strategist": { skills: ["sales_strategy"] }, outreach: { skills: [] } },
      runs,
    );
    const strategist = roster.find((a) => a.name === "sales-strategist")!;
    expect(strategist).toMatchObject({
      label: "Sales strategist",
      skills: ["sales_strategy"],
      registered: true,
      runs: 4,
      ok: 2,
      failed: 1,
      running: 1,
      running_since: ago(2_000),
      last_kind: "sales_plan",
    });
    expect(strategist.success_rate).toBeCloseTo(2 / 3);
    expect(roster.find((a) => a.name === "outreach")).toMatchObject({
      runs: 0,
      success_rate: null,
      last_run_at: null,
    });
    expect(roster.find((a) => a.name === "discovery")).toMatchObject({
      registered: false,
      runs: 1,
    });
  });
});
