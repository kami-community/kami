"use client";

import { useState } from "react";
import type { PipelineView } from "@/lib/sales/pipeline";
import type { PipelineStage } from "@/lib/salesTypes";
import { withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import AccountDrawer from "@/components/AccountDrawer";

const STAGE_LABELS: Record<PipelineStage, string> = {
  researching: "Researching",
  ready_for_approval: "Ready",
  sequencing: "Sequencing",
  sent: "Sent",
  engaged: "Engaged",
  qualified: "Qualified",
  meeting_proposed: "Meeting",
  invited: "Invited",
  accepted: "Accepted",
  closed_won: "Won",
  closed_lost: "Lost",
  invalid: "Invalid",
  suppressed: "Suppressed",
};

const VISIBLE_STAGES: PipelineStage[] = [
  "researching",
  "ready_for_approval",
  "sequencing",
  "sent",
  "engaged",
  "qualified",
  "meeting_proposed",
  "invited",
  "accepted",
  "closed_won",
  "closed_lost",
  "suppressed",
];

interface SalesPipelineProps {
  sessionDbId: string | null;
}

export default function SalesPipeline({ sessionDbId }: SalesPipelineProps) {
  const { data, error, loading, reload } = useApi<PipelineView>(
    sessionDbId ? withQuery("/api/sales/pipeline", { session_id: sessionDbId }) : null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <section className="panel-section" aria-labelledby="sales-pipeline-title">
      <p id="sales-pipeline-title" className="label-caps">
        Pipeline {data ? `(${data.total})` : ""}
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {loading && !data && <p className="fine-print">Loading pipeline…</p>}

      {data && (
        <div className="pipeline-board">
          {VISIBLE_STAGES.map((stage) => {
            const cards = data.pipeline[stage] ?? [];
            return (
              <div key={stage} className="pipeline-col">
                <p className="label-caps pipeline-col__head">
                  {STAGE_LABELS[stage]} ({cards.length})
                </p>
                <div className="card-list card-list--tight">
                  {cards.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      className="kraft-card pipeline-card"
                      aria-pressed={selectedId === acc.id}
                      onClick={() => setSelectedId(acc.id ?? null)}
                    >
                      <span className="pipeline-card__name">{acc.name}</span>
                      <span className="fine-print">
                        {acc.tier ? `T${acc.tier}` : "—"}
                        {acc.score != null ? ` · ${Math.round(acc.score)}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedId && (
        <AccountDrawer
          accountId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={reload}
        />
      )}
    </section>
  );
}
