import { describe, expect, it } from "vitest";
import { rowToPlan } from "./rows";

const base = { id: "p1", session_id: "s1", version: 1, status: "draft" };

describe("rowToPlan source", () => {
  it("marks scaffold plans as offline fallbacks", () => {
    expect(
      rowToPlan({ ...base, channel_rationale: "[Offline fallback — Hermes parse failed] Email" })
        .source,
    ).toBe("offline_fallback");
    expect(
      rowToPlan({ ...base, channel_rationale: "Sales plan needs research confirmation. Email" })
        .source,
    ).toBe("offline_fallback");
  });

  it("treats researched plans as Hermes plans", () => {
    expect(
      rowToPlan({ ...base, channel_rationale: "Email first: docs leads reply fastest." }).source,
    ).toBe("hermes");
  });
});
