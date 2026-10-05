"use client";

import type { SalesSegment } from "@/lib/domain/segments";
import type { LeadScoreFactors, SalesAccount, SalesPlan } from "@/lib/salesTypes";

interface AccountWithScore extends SalesAccount {
  score?: { factors: LeadScoreFactors };
}

interface SalesFunnelProps {
  segments?: SalesSegment[] | null;
  plan?: SalesPlan | null;
  accounts?: AccountWithScore[];
}

function quadrant(fit: number, intent: number): string {
  const hiFit = fit >= 0.55;
  const hiIntent = intent >= 0.45;
  if (hiFit && hiIntent) return "Act now";
  if (hiFit && !hiIntent) return "Nurture";
  if (!hiFit && hiIntent) return "Qualify";
  return "Park";
}

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

  const byQuad: Record<string, number> = { "Act now": 0, Nurture: 0, Qualify: 0, Park: 0 };
  for (const a of accounts) {
    const f = a.score?.factors;
    if (!f) continue;
    byQuad[quadrant(f.fit, f.intent)]++;
  }
  const hasScores = accounts.some((a) => a.score?.factors);

  if (!buckets.length && !hasScores) return null;

  return (
    <div style={{ marginBottom: "var(--stack-md)" }}>
      {buckets.length > 0 && (
        <>
          <p className="label-caps" style={{ marginBottom: "0.35rem" }}>
            Funnel budgets
          </p>
          <div
            style={{
              display: "flex",
              gap: "var(--stack-sm)",
              flexWrap: "wrap",
              marginBottom: "var(--stack-sm)",
            }}
          >
            {buckets.map((b) => (
              <div
                key={b.key}
                style={{
                  border: "1px solid var(--outline)",
                  padding: "0.5rem 0.65rem",
                  flex: "1 1 120px",
                  fontSize: 13,
                }}
              >
                <strong>{b.name}</strong>
                <div
                  className="mono"
                  style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: 2 }}
                >
                  ~{b.count} · {b.motion}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {hasScores && (
        <>
          <p className="label-caps" style={{ marginBottom: "0.35rem" }}>
            Fit × Timing
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.35rem",
              maxWidth: 360,
              fontSize: 12,
            }}
          >
            {(["Act now", "Nurture", "Qualify", "Park"] as const).map((q) => (
              <div
                key={q}
                style={{ border: "1px solid var(--outline-variant)", padding: "0.4rem 0.5rem" }}
              >
                <span className="mono" style={{ color: "var(--ink-soft)" }}>
                  {q}
                </span>
                <strong style={{ float: "right" }}>{byQuad[q]}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
