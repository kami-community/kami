"use client";

import { useCallback, useEffect, useState } from "react";
import type { PipelineStage, SalesAccount } from "@/lib/salesTypes";
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

type PipelineAccount = SalesAccount & { score?: number; score_explanation?: string };

interface SalesPipelineProps {
  sessionDbId: string | null;
}

export default function SalesPipeline({ sessionDbId }: SalesPipelineProps) {
  const [pipeline, setPipeline] = useState<Record<string, PipelineAccount[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchPipeline = useCallback(() => {
    if (!sessionDbId) return;
    fetch(`/api/sales/pipeline?session_id=${sessionDbId}`)
      .then((r) => r.json())
      .then((j) => setPipeline(j.pipeline ?? {}))
      .catch(() => {});
  }, [sessionDbId]);

  useEffect(() => {
    fetchPipeline();
  }, [fetchPipeline]);

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          overflowX: "auto",
          paddingBottom: "var(--stack-sm)",
        }}
      >
        {VISIBLE_STAGES.map((stage) => {
          const cards = pipeline[stage] ?? [];
          return (
            <div key={stage} style={{ minWidth: 140, flex: "0 0 140px" }}>
              <p
                className="label-caps"
                style={{ fontSize: 10, marginBottom: "0.35rem", color: "var(--outline)" }}
              >
                {STAGE_LABELS[stage]} ({cards.length})
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {cards.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    className="kraft-card"
                    onClick={() => setSelectedId(acc.id ?? null)}
                    style={{
                      padding: "0.5rem",
                      textAlign: "left",
                      cursor: "pointer",
                      border: selectedId === acc.id ? "1px solid var(--hanko)" : undefined,
                      width: "100%",
                    }}
                  >
                    <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{acc.name}</p>
                    <p
                      className="mono"
                      style={{ fontSize: 11, color: "var(--ink-soft)", margin: "0.2rem 0 0" }}
                    >
                      {acc.tier ? `T${acc.tier}` : "—"}
                      {acc.score != null ? ` · ${Math.round(acc.score)}` : ""}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {selectedId && (
        <AccountDrawer
          accountId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={fetchPipeline}
        />
      )}
    </div>
  );
}
