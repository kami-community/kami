"use client";

import { useState } from "react";
import AccountDrawer from "@/components/AccountDrawer";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import EmptyState from "@/components/ui/EmptyState";
import { IconLayers } from "@/components/ui/icons";
import { CountBadge, Monogram } from "@/components/ui/Pills";
import Skeleton from "@/components/ui/Skeleton";
import { withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type { PipelineView } from "@/lib/sales/pipeline";
import type { PipelineStage } from "@/lib/salesTypes";

type StageTone = "muted" | "orange" | "accent" | "green" | "red";

const STAGES: { key: PipelineStage; label: string; tone: StageTone }[] = [
  { key: "researching", label: "Researching", tone: "muted" },
  { key: "ready_for_approval", label: "Picked", tone: "orange" },
  { key: "sequencing", label: "Emails drafted", tone: "accent" },
  { key: "sent", label: "Emailed", tone: "accent" },
  { key: "engaged", label: "Replied", tone: "green" },
  { key: "qualified", label: "Interested", tone: "green" },
  { key: "meeting_proposed", label: "Meeting asked", tone: "green" },
  { key: "invited", label: "Invite sent", tone: "green" },
  { key: "accepted", label: "Meeting booked", tone: "green" },
  { key: "closed_won", label: "Won", tone: "green" },
  { key: "closed_lost", label: "Lost", tone: "red" },
  { key: "suppressed", label: "Do not contact", tone: "red" },
];

/** Columns always shown, even when empty, so the board keeps its shape. */
const CORE: PipelineStage[] = ["researching", "sequencing", "sent", "engaged"];

/** Every company by stage: a scrollable board; open a card for its details. */
export default function SalesPipeline({
  sessionDbId,
  onFindCompanies,
}: {
  sessionDbId: string | null;
  /** empty-state action: go to the Companies step */
  onFindCompanies?: () => void;
}) {
  const { data, error, reload } = useApi<PipelineView>(
    sessionDbId ? withQuery("/api/sales/pipeline", { session_id: sessionDbId }) : null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (error) {
    return (
      <Callout
        tone="error"
        title="Could not load the pipeline"
        actions={
          <Button size="sm" variant="secondary" onClick={reload}>
            Try again
          </Button>
        }
      >
        {error}
      </Callout>
    );
  }
  if (!data) return <Skeleton title lines={6} />;
  if (data.total === 0) {
    return (
      <EmptyState
        title="No companies yet"
        icon={<IconLayers size={16} />}
        action={
          onFindCompanies ? (
            <Button size="sm" variant="secondary" onClick={onFindCompanies}>
              Find companies
            </Button>
          ) : undefined
        }
      >
        Companies show up here once Kami has checked them.
      </EmptyState>
    );
  }

  const columns = STAGES.filter(
    (s) => (data.pipeline[s.key] ?? []).length > 0 || CORE.includes(s.key),
  );

  return (
    <div className="pipeline">
      <div className="pipeline__board" role="list" aria-label="Pipeline">
        {columns.map((stage) => {
          const cards = data.pipeline[stage.key] ?? [];
          return (
            <section
              key={stage.key}
              className="pipeline__col"
              role="listitem"
              aria-label={stage.label}
            >
              <header className="pipeline__head">
                <span className={`pipeline__dot pipeline__dot--${stage.tone}`} />
                <span className="pipeline__label">{stage.label}</span>
                <CountBadge>{cards.length}</CountBadge>
              </header>
              <div className="pipeline__cards">
                {cards.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    className="pipeline__card"
                    aria-pressed={selectedId === acc.id}
                    onClick={() => setSelectedId(acc.id ?? null)}
                  >
                    <Monogram name={acc.name} shape="square" />
                    <span className="pipeline__name truncate">{acc.name}</span>
                    {acc.domain && <span className="pipeline__meta truncate">{acc.domain}</span>}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {selectedId && (
        <AccountDrawer
          accountId={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={reload}
        />
      )}
    </div>
  );
}
