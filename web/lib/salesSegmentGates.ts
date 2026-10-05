import type { SalesSegment } from "@/lib/domain/segments";

/** B2B segments need at least one candidate company domain. PLG needs a persona. */
export function validateSegmentsForConfirm(segments: SalesSegment[]): string | null {
  if (!segments.length) return "Add at least one segment before confirming.";
  for (const s of segments) {
    if (
      s.motion === "b2b_sales_assisted" &&
      (!s.candidate_companies || s.candidate_companies.length < 1)
    ) {
      return `Segment "${s.name}" needs at least one candidate company domain before confirm.`;
    }
    if (s.motion === "plg_self_serve") {
      const personas = (s.example_user_personas ?? []).filter((p) => p.label?.trim());
      if (!personas.length) {
        return `PLG segment "${s.name}" needs at least one example user (who would try the product themselves). Use “+ Add example user”.`;
      }
    }
  }
  return null;
}
