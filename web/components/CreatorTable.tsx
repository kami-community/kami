"use client";

import { useState } from "react";
import type { MarketingCrmEntry } from "@/lib/marketingTypes";
import StatusChip from "@/components/StatusChip";

interface CreatorTableProps {
  creators: MarketingCrmEntry[];
  onApproveOutreach: (ids: string[]) => void;
}

export default function CreatorTable({ creators, onApproveOutreach }: CreatorTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const identified = creators.filter((c) => c.status === "identified");

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
            {identified.length} creators ready for outreach
          </p>
          <button
            className="hanko-btn"
            style={{ fontSize: 13, padding: "0.5rem 1rem" }}
            onClick={() => onApproveOutreach(identified.map((c) => c.id))}
          >
            Approve outreach ({identified.length})
          </button>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack-sm)" }}>
        {creators.length === 0 && (
          <p className="mono" style={{ color: "var(--ink-soft)" }}>
            No creators yet. Run discovery to find matches.
          </p>
        )}
        {creators.map((creator) => (
          <div className="kraft-card" key={creator.id} style={{ padding: "0.75rem 1rem" }}>
            <button
              type="button"
              onClick={() => setExpandedId(expandedId === creator.id ? null : creator.id)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
              }}
            >
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
                    {creator.name ?? creator.handle}
                  </strong>
                  <p className="mono" style={{ color: "var(--ink-soft)", fontSize: 12 }}>
                    @{creator.handle}
                  </p>
                </div>
                <div
                  className="mono"
                  style={{ fontSize: 12, color: "var(--ink-soft)", display: "flex", gap: "1rem" }}
                >
                  {creator.followers != null && (
                    <span>{(creator.followers / 1000).toFixed(1)}k followers</span>
                  )}
                  {creator.engagement_rate != null && (
                    <span>{(creator.engagement_rate * 100).toFixed(1)}% eng</span>
                  )}
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  {creator.offer_amount != null && (
                    <span className="mono" style={{ fontSize: 12 }}>
                      ${creator.offer_amount}
                    </span>
                  )}
                  <StatusChip label={creator.status} />
                </div>
                <span style={{ color: "var(--hanko)", fontSize: 12 }}>
                  {expandedId === creator.id ? "−" : "+"}
                </span>
              </div>
            </button>
            {expandedId === creator.id && (
              <div
                style={{
                  marginTop: "var(--stack-sm)",
                  paddingTop: "var(--stack-sm)",
                  borderTop: "1px solid var(--crease)",
                }}
              >
                {creator.relevance_reasoning && (
                  <p style={{ fontSize: 13, marginBottom: "0.4rem" }}>
                    <span className="label-caps" style={{ marginRight: "0.5rem" }}>
                      Why
                    </span>
                    {creator.relevance_reasoning}
                  </p>
                )}
                {creator.niche_match_score != null && (
                  <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                    Niche match: {Math.round(creator.niche_match_score * 100)}%
                  </p>
                )}
                {creator.calendar_event_id && (
                  <p className="mono" style={{ fontSize: 12, color: "var(--moss)" }}>
                    ✓ Calendar event scheduled
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
