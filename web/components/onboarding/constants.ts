/**
 * Onboarding constants and pure helpers, shared by the onboarding steps.
 * Browser-safe and pure.
 */

/** Optional goals a founder can pick on step 1 (stored on the campaign). */
export const GOALS = ["Book meetings", "Get signups", "Build awareness", "Raise funding"] as const;

/** Goals that point at distribution before outbound. */
const DISTRIBUTION_GOALS = ["Get signups", "Build awareness"];

export type Job = "sales" | "distribution";

/** Normalise what a founder types into a bare domain, or null if it isn't one. */
export function cleanDomain(input: string): string | null {
  const cleaned = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#].*$/, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(cleaned) ? cleaned : null;
}

/** Kami's recommended first job: distribution for signup/awareness goals, else sales. */
export function recommendedJob(goals: readonly string[]): Job {
  return goals.some((g) => DISTRIBUTION_GOALS.includes(g)) ? "distribution" : "sales";
}

/** Where the workspace opens for a chosen job. */
export function jobHref(campaignId: string, job: Job): string {
  return job === "sales" ? `/c/${campaignId}/sales/plan` : `/c/${campaignId}/distribution/plan`;
}
