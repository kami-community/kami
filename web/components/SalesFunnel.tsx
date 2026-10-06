"use client";

import { quadrant } from "@/components/sales/target-review/rules";
import Card from "@/components/ui/Card";
import type { SalesSegment } from "@/lib/domain/segments";
import type { LeadScoreFactors, SalesAccount, SalesPlan } from "@/lib/salesTypes";

interface AccountWithScore extends SalesAccount {
  score?: { factors: LeadScoreFactors };
}

const QUADRANTS = [
  { key: "Act now", hint: "Good fit, good timing", tone: "green" },
  { key: "Nurture", hint: "Good fit, not yet", tone: "accent" },
  { key: "Qualify", hint: "Good timing, fit unclear", tone: "orange" },
  { key: "Park", hint: "Not a fit for now", tone: "muted" },
] as const;

/**
 * How many companies Kami plans to research per group ("budgets"), and once
 * companies are scored, how they split by fit and timing ("scores").
 */
export default function SalesFunnel({
  segments,
  plan,
  accounts = [],
  show = "both",
}: {
  segments?: SalesSegment[] | null;
  plan?: SalesPlan | null;
  accounts?: AccountWithScore[];
  show?: "budgets" | "scores" | "both";
}) {
  const buckets =
    show === "scores"
      ? []
      : segments?.length
        ? segments.map((s) => ({ key: s.key, name: s.name, count: s.target_count }))
        : (plan?.tiers.map((t) => ({
            key: `tier-${t.tier}`,
            name: t.label,
            count: t.target_count,
          })) ?? []);

  const byQuad: Record<string, number> = { "Act now": 0, Nurture: 0, Qualify: 0, Park: 0 };
  for (const a of accounts) {
    const f = a.score?.factors;
    if (f) byQuad[quadrant(f.fit, f.intent)]++;
  }
  const hasScores = show !== "budgets" && accounts.some((a) => a.score?.factors);
  const total = buckets.reduce((n, b) => n + (b.count || 0), 0) || 1;

  if (!buckets.length && !hasScores) return null;

  return (
    <div className="funnel">
      {buckets.length > 0 && (
        <Card className="funnel__budgets" aria-label="Companies to research per group">
          {buckets.map((b) => (
            <div key={b.key} className="funnel__row">
              <span className="funnel__name truncate">{b.name}</span>
              <span className="funnel__bar" aria-hidden>
                {/* the bar width is data, not styling */}
                <span style={{ width: `${Math.max(6, (b.count / total) * 100)}%` }} />
              </span>
              <span className="funnel__count tabular">~{b.count}</span>
            </div>
          ))}
        </Card>
      )}

      {hasScores && (
        <div className="funnel__grid" role="list" aria-label="Companies by fit and timing">
          {QUADRANTS.map((q) => (
            <div key={q.key} className="funnel__cell" role="listitem">
              <span className="funnel__cell-head">
                <span className={`funnel__dot funnel__dot--${q.tone}`} />
                {q.key}
              </span>
              <span className="funnel__cell-count tabular">{byQuad[q.key]}</span>
              <span className="funnel__cell-hint">{q.hint}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
