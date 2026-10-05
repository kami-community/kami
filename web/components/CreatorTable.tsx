"use client";

import { useState } from "react";
import type { MarketingCrmEntry } from "@/lib/marketingTypes";
import StatusChip from "@/components/StatusChip";

interface CreatorTableProps {
  creators: MarketingCrmEntry[];
  busy?: boolean;
  disabled?: boolean;
  onApproveOutreach: (ids: string[]) => void;
}

export default function CreatorTable({
  creators,
  busy,
  disabled,
  onApproveOutreach,
}: CreatorTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const identified = creators.filter((c) => c.status === "identified");

  return (
    <div>
      {identified.length > 0 && (
        <div className="section-head">
          <p className="fine-print">{identified.length} creators ready for outreach</p>
          <button
            type="button"
            className="hanko-btn"
            disabled={busy || disabled}
            onClick={() => onApproveOutreach(identified.map((c) => c.id))}
          >
            {busy ? "Sending…" : `Approve outreach (${identified.length})`}
          </button>
        </div>
      )}
      <div className="card-list">
        {creators.length === 0 && (
          <p className="fine-print">No creators yet. Run discovery to find matches.</p>
        )}
        {creators.map((creator) => {
          const expanded = expandedId === creator.id;
          return (
            <div className="kraft-card entity-card" key={creator.id}>
              <button
                type="button"
                className="expand-toggle"
                aria-expanded={expanded}
                onClick={() => setExpandedId(expanded ? null : creator.id)}
              >
                <span className="entity-card__row">
                  <span className="entity-card__main">
                    <strong className="entity-card__name">{creator.name ?? creator.handle}</strong>
                    <span className="fine-print notice-card__body">@{creator.handle}</span>
                  </span>
                  <span className="fine-print entity-card__stats">
                    {creator.followers != null && (
                      <span>{(creator.followers / 1000).toFixed(1)}k followers</span>
                    )}
                    {creator.engagement_rate != null && (
                      <span>{(creator.engagement_rate * 100).toFixed(1)}% eng</span>
                    )}
                  </span>
                  <span className="entity-card__stats">
                    {creator.offer_amount != null && (
                      <span className="fine-print">${creator.offer_amount}</span>
                    )}
                    <StatusChip label={creator.status} />
                  </span>
                  <span className="fine-print fine-print--alert" aria-hidden>
                    {expanded ? "−" : "+"}
                  </span>
                </span>
              </button>
              {expanded && (
                <div className="entity-card__detail">
                  {creator.relevance_reasoning && (
                    <p className="entity-card__reason">
                      <span className="label-caps">Why </span>
                      {creator.relevance_reasoning}
                    </p>
                  )}
                  {creator.niche_match_score != null && (
                    <p className="fine-print">
                      Niche match: {Math.round(creator.niche_match_score * 100)}%
                    </p>
                  )}
                  {creator.calendar_event_id && (
                    <p className="fine-print fine-print--ok">✓ Calendar event scheduled</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
