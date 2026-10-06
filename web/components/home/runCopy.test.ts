import { describe, expect, it } from "vitest";
import { timeAgo } from "@/components/inbox/format";
import { agentName, describeRun } from "./runCopy";

const run = (kind: string, agent: string | null, status = "ok") => ({
  id: "r",
  kind,
  agent,
  status,
  created_at: "2026-10-06T00:00:00Z",
});

describe("describeRun", () => {
  it("says what an agent did in plain language", () => {
    expect(describeRun(run("sales_drafts", "outreach"))).toBe("Outreach drafted emails");
    expect(describeRun(run("dossier_generate_retry", "brand-analyst"))).toBe(
      "Brand analyst wrote your company profile",
    );
  });

  it("covers live and failed runs and unknown kinds", () => {
    expect(describeRun(run("sales_plan", "sales-strategist", "running"))).toBe(
      "Sales strategist is working now",
    );
    expect(describeRun(run("sales_plan", "sales-strategist", "timeout"))).toBe(
      "Sales strategist couldn't finish: drafted an outreach plan",
    );
    expect(describeRun(run("new_thing", "some-agent"))).toBe("Some agent ran new thing");
    expect(agentName(null)).toBe("Kami");
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");
  it("rounds to the largest sensible unit", () => {
    expect(timeAgo("2026-10-06T11:59:50Z", now)).toBe("just now");
    expect(timeAgo("2026-10-06T11:55:00Z", now)).toBe("5m ago");
    expect(timeAgo("2026-10-06T09:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-10-04T12:00:00Z", now)).toBe("2d ago");
    expect(timeAgo(null, now)).toBe("");
  });
});
