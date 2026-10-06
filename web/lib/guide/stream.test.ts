import { describe, expect, it } from "vitest";
import { createGuideEventParser, encodeGuideEvent } from "@/lib/domain/guideEvents";
import { createFollowUpSplitter } from "./stream";

function run(chunks: string[]) {
  const s = createFollowUpSplitter();
  let shown = "";
  for (const c of chunks) shown += s.push(c);
  const end = s.end();
  return { shown: shown + end.text, followUps: end.followUps };
}

describe("createFollowUpSplitter", () => {
  it("passes plain answers through untouched", () => {
    expect(run(["Start with ", "Sales.\nThen ", "post on X."])).toEqual({
      shown: "Start with Sales.\nThen post on X.",
      followUps: [],
    });
  });

  it("strips a trailing follow-up line even when split across chunks", () => {
    const r = run([
      "Approve the plan.\n",
      "FOLLOW",
      "_UPS: Why this ICP? | ",
      "What should I send first?",
    ]);
    expect(r.shown).toBe("Approve the plan.\n");
    expect(r.followUps).toEqual(["Why this ICP?", "What should I send first?"]);
  });

  it("releases text that only looked like the marker", () => {
    expect(run(["FOLLOW", " the plan first."]).shown).toBe("FOLLOW the plan first.");
  });
});

describe("guide event wire format", () => {
  it("round-trips events split at arbitrary boundaries", () => {
    const wire =
      encodeGuideEvent({ event: "context", data: { sources: [], focus: "sales" } }) +
      encodeGuideEvent({ event: "delta", data: { text: "Hi\n\nthere" } }) +
      encodeGuideEvent({ event: "done", data: { durationMs: 12 } });
    const p = createGuideEventParser();
    const events = [
      ...p.push(wire.slice(0, 17)),
      ...p.push(wire.slice(17, 60)),
      ...p.push(wire.slice(60)),
      ...p.end(),
    ];
    expect(events.map((e) => e.event)).toEqual(["context", "delta", "done"]);
    expect(events[1]).toEqual({ event: "delta", data: { text: "Hi\n\nthere" } });
  });
});
