"use client";

import { useState, type ReactNode } from "react";
import LoadingState from "@/components/bui/LoadingState";
import ThinkingState from "@/components/bui/ThinkingState";
import { useStagedProgress } from "@/components/bui/useStagedProgress";
import ConfirmDialog from "@/components/ConfirmDialog";
import ConnectSocials, { useConnections } from "@/components/ConnectSocials";
import OpportunityCard, { isTemplate } from "@/components/marketing/OpportunityCard";
import { PLATFORM_LABELS } from "@/components/marketing/platforms";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import EmptyState from "@/components/ui/EmptyState";
import { IconMegaphone, IconSearch } from "@/components/ui/icons";
import Segmented from "@/components/ui/Segmented";
import { api, errorMessage } from "@/lib/client/api";
import type { DistributionOpportunity, DistributionPlatform } from "@/lib/distributionTypes";

interface OpportunityQueueProps {
  opportunities: DistributionOpportunity[];
  sessionDbId: string | null;
  surfaces: DistributionPlatform[];
  researchNote?: string | null;
  researchSource?: string | null;
  busy?: boolean;
  paused?: boolean;
  /** names the agents doing the research, e.g. "Distribution manager is briefing X and Reddit specialists…" */
  busyLabel?: string;
  /** a link to where X is connected (Settings → Connections); falls back to an inline connect button */
  connectX?: ReactNode;
  onRefresh: () => void;
  onResearch: () => void;
}

type Filter = "review" | "done" | "all";

const isDone = (o: DistributionOpportunity) =>
  o.action_status === "published" ||
  o.action_status === "posted_manual" ||
  o.approval_status === "skipped";

/** Today's distribution opportunities: review, post (X) or copy, then record what happened. */
export default function OpportunityQueue({
  opportunities,
  sessionDbId,
  surfaces,
  researchNote,
  researchSource,
  busy = false,
  paused = false,
  busyLabel = "Distribution manager is briefing platform specialists…",
  connectX,
  onRefresh,
  onResearch,
}: OpportunityQueueProps) {
  const connections = useConnections(sessionDbId);
  const xHandle = connections.handleOf("x");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, string>>({});
  const [showTemplates, setShowTemplates] = useState(false);
  const [filter, setFilter] = useState<Filter>("review");
  const [pendingPost, setPendingPost] = useState<{
    opportunity: DistributionOpportunity;
    text: string;
  } | null>(null);

  const stages = [
    "Distribution manager reading your plan and dossier",
    ...surfaces.map((s) => `${PLATFORM_LABELS[s]} specialist scanning for live conversations`),
    "Drafting one useful contribution for each",
  ];
  const staged = useStagedProgress(stages, busy, { stepMs: 6000 });

  const templates = opportunities.filter(isTemplate);
  const researched = opportunities.filter((o) => !isTemplate(o));
  const pool = showTemplates ? opportunities : researched;
  const toReview = pool.filter((o) => !isDone(o));
  const finished = pool.filter(isDone);
  const visible = filter === "review" ? toReview : filter === "done" ? finished : pool;
  const say = (id: string, message: string) => setFlash((f) => ({ ...f, [id]: message }));
  const needsX = surfaces.includes("x") && connections.state && !xHandle;

  async function save(id: string, edits: Record<string, unknown>, message: string) {
    if (!sessionDbId) return;
    setSavingId(id);
    try {
      await api.post("/api/marketing/distribution/opportunities", {
        session_id: sessionDbId,
        action: "update",
        id,
        ...edits,
      });
      say(id, message);
      onRefresh();
    } catch (err) {
      say(id, errorMessage(err, "Could not save — try again."));
    } finally {
      setSavingId(null);
    }
  }

  async function publish() {
    if (!pendingPost || !sessionDbId) return;
    const { opportunity, text } = pendingPost;
    setSavingId(opportunity.id);
    try {
      const res = await api.post<{ url: string | null }>(
        `/api/marketing/distribution/opportunities/${opportunity.id}/publish`,
        { session_id: sessionDbId, text },
      );
      say(opportunity.id, res.url ? `Posted to X — ${res.url}` : "Posted to X.");
      setPendingPost(null);
      onRefresh();
    } catch (err) {
      say(opportunity.id, errorMessage(err, "X post failed"));
      setPendingPost(null);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="stack" aria-label="Distribution opportunities">
      <div className="queue-bar">
        <Segmented<Filter>
          label="Filter opportunities"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "review", label: "To review", count: toReview.length },
            { value: "done", label: "Done", count: finished.length },
            { value: "all", label: "All", count: pool.length },
          ]}
        />
        <Button
          size="sm"
          variant={toReview.length ? "secondary" : "accent"}
          icon={<IconSearch size={13} />}
          onClick={onResearch}
          busy={busy}
          disabled={!sessionDbId || paused}
          title={paused ? "Distribution is paused" : undefined}
        >
          {researched.length ? "Find more" : "Find opportunities"}
        </Button>
      </div>

      {needsX && (
        <p className="dist-hint">
          <span>
            Connect X to post replies straight from Kami. Other surfaces: copy the draft and post it
            yourself.
          </span>
          {connectX ??
            (sessionDbId && <ConnectSocials sessionId={sessionDbId} platforms={["x"]} />)}
        </p>
      )}
      {connections.error && <Callout tone="error">{connections.error}</Callout>}

      {!busy && (researchSource || researchNote) && (
        <Callout tone={researchSource === "scaffold" ? "warn" : "info"}>
          {researchSource === "scaffold" ? "Starter templates — " : "Researched by Hermes — "}
          {researchNote || "review each item before posting."}
        </Callout>
      )}

      {busy && (
        <div className="dist-wait">
          <LoadingState
            label={busyLabel}
            startedAt={staged.startedAt ?? undefined}
            detail="Each specialist reads live threads on its surface. This can take a few minutes."
          />
          <ThinkingState working rows={staged.rows} active="Researching" done="Research done" />
        </div>
      )}

      {!busy && opportunities.length === 0 && (
        <EmptyState title="No opportunities yet" icon={<IconMegaphone size={16} />}>
          {paused
            ? "Distribution is paused. Resume it to find opportunities."
            : "Find opportunities and Kami looks for live conversations on your approved surfaces, with a drafted contribution for each."}
        </EmptyState>
      )}

      {!busy && pool.length > 0 && visible.length === 0 && (
        <EmptyState
          title={filter === "review" ? "All caught up" : "Nothing here yet"}
          icon={<IconMegaphone size={16} />}
        >
          {filter === "review"
            ? "Every opportunity has been posted or skipped. Find more when you’re ready."
            : "Posted and skipped items land here."}
        </EmptyState>
      )}

      <div className="opp-list">
        {visible.map((o) => (
          <OpportunityCard
            key={o.id}
            opportunity={o}
            sessionId={sessionDbId ?? ""}
            canPostToX={Boolean(xHandle) && !paused}
            saving={savingId === o.id}
            flash={flash[o.id]}
            onSave={(edits, message) => void save(o.id, edits, message)}
            onPostToX={(text) => {
              if (!text.trim()) return say(o.id, "The draft is empty.");
              setPendingPost({ opportunity: o, text: text.trim() });
            }}
          />
        ))}
      </div>

      {templates.length > 0 && (
        <div className="dist-templates">
          <Button
            size="xs"
            variant="quiet"
            aria-expanded={showTemplates}
            onClick={() => setShowTemplates((v) => !v)}
          >
            {showTemplates ? "Hide" : "Show"} {templates.length} starter template
            {templates.length === 1 ? "" : "s"}
          </Button>
          {!showTemplates && researched.length === 0 && (
            <p className="text-3 text-xs">
              Research didn’t find live conversations this time, so Kami prepared starter templates.
              They are not researched — check each one before you use it.
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingPost)}
        title={`Post to X${xHandle ? ` as ${xHandle}` : ""}?`}
        body={pendingPost ? <p className="send-preview__body">{pendingPost.text}</p> : undefined}
        confirmLabel="Post to X"
        busy={Boolean(pendingPost && savingId === pendingPost.opportunity.id)}
        onConfirm={() => void publish()}
        onCancel={() => setPendingPost(null)}
      />
    </section>
  );
}
