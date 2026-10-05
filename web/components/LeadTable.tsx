"use client";

import type { MarketingCrmEntry } from "@/lib/marketingTypes";
import StatusChip from "@/components/StatusChip";

interface LeadTableProps {
  leads: MarketingCrmEntry[];
  onApprove: (ids: string[]) => void;
}

export default function LeadTable({ leads, onApprove }: LeadTableProps) {
  const identified = leads.filter((l) => l.status === "identified");

  return (
    <div>
      {identified.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "var(--stack-sm)",
          }}
        >
          <p className="mono" style={{ color: "var(--ink-soft)", fontSize: 12 }}>
            {identified.length} leads awaiting approval
          </p>
          <button
            className="hanko-btn"
            style={{ fontSize: 13, padding: "0.5rem 1rem" }}
            onClick={() => onApprove(identified.map((l) => l.id))}
          >
            Approve all ({identified.length})
          </button>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack-sm)" }}>
        {leads.length === 0 && (
          <p className="mono" style={{ color: "var(--ink-soft)" }}>
            No leads yet. Run discovery to find prospects.
          </p>
        )}
        {leads.map((lead) => (
          <div className="kraft-card" key={lead.id} style={{ padding: "0.75rem 1rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "1rem",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 160 }}>
                <strong style={{ fontFamily: "var(--font-headline)", fontSize: 14 }}>
                  {lead.name ?? lead.handle}
                </strong>
                <p className="mono" style={{ color: "var(--ink-soft)", fontSize: 12 }}>
                  @{lead.handle}
                </p>
              </div>
              <div className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                {lead.niche_match_score != null &&
                  `relevance: ${Math.round(lead.niche_match_score * 100)}%`}
              </div>
              <StatusChip label={lead.status} />
            </div>
            {lead.relevance_reasoning && (
              <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: "0.4rem" }}>
                {lead.relevance_reasoning}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
