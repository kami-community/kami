import { describe, expect, it } from "vitest";
import type { PipelineStage, SalesAccount } from "@/lib/salesTypes";
import { PIPELINE_STAGES, buildPipeline, type ScoreRow } from "./pipeline";

const account = (id: string, stage: string): SalesAccount => ({
  id,
  session_id: "s",
  name: id,
  pipeline_stage: stage as PipelineStage,
});

describe("buildPipeline", () => {
  it("creates an empty column for every stage", () => {
    const { pipeline, total } = buildPipeline([], []);
    expect(Object.keys(pipeline)).toEqual(PIPELINE_STAGES);
    expect(total).toBe(0);
  });

  it("groups accounts by stage in input order and drops unknown stages", () => {
    const { pipeline, total } = buildPipeline(
      [
        account("a", "sent"),
        account("b", "researching"),
        account("c", "sent"),
        account("d", "bogus"),
      ],
      [],
    );
    expect(pipeline.sent.map((a) => a.id)).toEqual(["a", "c"]);
    expect(pipeline.researching.map((a) => a.id)).toEqual(["b"]);
    expect(total).toBe(3);
  });

  it("attaches the latest score, preferring priority over fit", () => {
    const scores: ScoreRow[] = [
      {
        account_id: "a",
        factors: { fit: 40 },
        explanation: "old",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        account_id: "a",
        factors: { fit: 70, priority: 90 },
        explanation: "new",
        created_at: "2026-02-01T00:00:00Z",
      },
      {
        account_id: "b",
        factors: { fit: 55 },
        explanation: "fit only",
        created_at: "2026-01-05T00:00:00Z",
      },
    ];
    const { pipeline } = buildPipeline([account("a", "engaged"), account("b", "engaged")], scores);
    expect(pipeline.engaged[0]).toMatchObject({ id: "a", score: 90, score_explanation: "new" });
    expect(pipeline.engaged[1]).toMatchObject({
      id: "b",
      score: 55,
      score_explanation: "fit only",
    });
  });

  it("leaves score undefined for unscored accounts", () => {
    const { pipeline } = buildPipeline([account("a", "qualified")], []);
    expect(pipeline.qualified[0].score).toBeUndefined();
  });
});
