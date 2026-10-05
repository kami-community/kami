"use client";

import type { MarketingCrmEntry } from "@/lib/marketingTypes";
import StatusChip from "@/components/StatusChip";

interface LeadTableProps {
  leads: MarketingCrmEntry[];
  busy?: boolean;
  disabled?: boolean;
  onApprove: (ids: string[]) => void;
}

export default function LeadTable({ leads, busy, disabled, onApprove }: LeadTableProps) {
  const identified = leads.filter((l) => l.status === "identified");

  return (
    <div>
      {identified.length > 0 && (
        <div className="section-head">
          <p className="fine-print">{identified.length} leads awaiting approval</p>
          <button
            type="button"
            className="hanko-btn"
            disabled={busy || disabled}
            onClick={() => onApprove(identified.map((l) => l.id))}
          >
            {busy ? "Sending…" : `Approve & DM all (${identified.length})`}
          </button>
        </div>
      )}
      <div className="card-list">
        {leads.length === 0 && (
          <p className="fine-print">No leads yet. Run discovery to find prospects.</p>
        )}
        {leads.map((lead) => (
          <div className="kraft-card entity-card" key={lead.id}>
            <div className="entity-card__row">
              <div className="entity-card__main">
                <strong className="entity-card__name">{lead.name ?? lead.handle}</strong>
                <p className="fine-print">@{lead.handle}</p>
              </div>
              {lead.niche_match_score != null && (
                <span className="fine-print">
                  relevance: {Math.round(lead.niche_match_score * 100)}%
                </span>
              )}
              <StatusChip label={lead.status} />
            </div>
            {lead.relevance_reasoning && (
              <p className="entity-card__reason">{lead.relevance_reasoning}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
