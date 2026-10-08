import { PLATFORM_LABELS } from "@/components/marketing/platforms";
import type { DistributionPlatform } from "@/lib/distributionTypes";

/** "X", "X and Reddit", "X, Reddit and Hacker News". */
export function listLabels(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** Plain-language name of the specialists the Distribution manager briefs for these surfaces. */
export function specialistsFor(surfaces: readonly DistributionPlatform[]): string {
  const names = surfaces.map((s) => PLATFORM_LABELS[s] ?? s);
  if (!names.length) return "platform specialists";
  return `${listLabels(names)} specialist${names.length === 1 ? "" : "s"}`;
}
