"use client";

import type { SalesSegment } from "@/lib/domain/segments";
import type { LeadScoreFactors, SalesAccount, SalesPlan } from "@/lib/salesTypes";
import { quadrant } from "@/components/sales/target-review/rules";

interface AccountWithScore extends SalesAccount {
  score?: { factors: LeadScoreFactors };
}

interface SalesFunnelProps {
  segments?: SalesSegment[] | null;
  plan?: SalesPlan | null;
  accounts?: AccountWithScore[];
}

const QUADRANTS = ["Act now", "Nurture", "Qualify", "Park"] as const;

export default function SalesFunnel({ segments, plan, accounts = [] }: SalesFunnelProps) {
  const buckets = segments?.length
    ? segments.map((s) => ({
        key: s.key,
        name: s.name,
        count: s.target_count,
        motion: s.motion === "plg_self_serve" ? "PLG" : "B2B",
      }))
    : (plan?.tiers.map((t) => ({
        key: `tier-${t.tier}`,
        name: t.label,
        count: t.target_count,
        motion: t.criteria,
      })) ?? []);

  const byQuad: Record<(typeof QUADRANTS)[number], number> = {
    "Act now": 0,
    Nurture: 0,
    Qualify: 0,
    Park: 0,
  };
  for (const a of accounts) {
    const f = a.score?.factors;
    if (f) byQuad[quadrant(f.fit, f.intent)]++;
  }
  const hasScores = accounts.some((a) => a.score?.factors);

  if (!buckets.length && !hasScores) return null;

  return (
    <div className="sales-funnel">
      {buckets.length > 0 && (
        <>
          <p className="label-caps">Funnel budgets</p>
          <div className="sales-funnel__buckets">
            {buckets.map((b) => (
              <div key={b.key} className="sales-funnel__bucket">
                <strong>{b.name}</strong>
                <div className="mono muted sales-funnel__meta">
                  ~{b.count} · {b.motion}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {hasScores && (
        <>
          <p className="label-caps">Fit × Timing</p>
          <div className="sales-funnel__grid">
            {QUADRANTS.map((q) => (
              <div key={q} className="sales-funnel__cell">
                <span className="mono muted">{q}</span>
                <strong>{byQuad[q]}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
