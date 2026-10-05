"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import ConnectSocials, { useConnections } from "@/components/ConnectSocials";
import OpportunityCard, { isTemplate } from "@/components/marketing/OpportunityCard";
import EmptyState from "@/components/ui/EmptyState";
import { api, errorMessage } from "@/lib/client/api";
import type { DistributionOpportunity } from "@/lib/distributionTypes";

interface OpportunityQueueProps {
  opportunities: DistributionOpportunity[];
  sessionDbId: string | null;
  researchNote?: string | null;
  researchSource?: string | null;
  busy?: boolean;
  onRefresh: () => void;
  onResearch: () => void;
}

/** Today's distribution opportunities: review, post (X) or copy, then record what happened. */
export default function OpportunityQueue({
  opportunities,
  sessionDbId,
  researchNote,
  researchSource,
  busy,
  onRefresh,
  onResearch,
}: OpportunityQueueProps) {
  const { handleOf } = useConnections(sessionDbId);
  const xHandle = handleOf("x");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, string>>({});
  const [showTemplates, setShowTemplates] = useState(false);
  const [pendingPost, setPendingPost] = useState<{
    opportunity: DistributionOpportunity;
    text: string;
  } | null>(null);

  const templates = opportunities.filter(isTemplate);
  const researched = opportunities.filter((o) => !isTemplate(o));
  const visible = showTemplates ? opportunities : researched;
  const say = (id: string, message: string) => setFlash((f) => ({ ...f, [id]: message }));

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
    <section>
      <div className="section-head">
        <p className="label-caps">Today&apos;s distribution opportunities</p>
        <button
          type="button"
          className={researched.length ? "btn-outline mono" : "hanko-btn"}
          onClick={onResearch}
          disabled={busy || !sessionDbId}
        >
          {busy ? "Researching…" : researched.length ? "Find more" : "Find opportunities"}
        </button>
      </div>

      {(researchSource || researchNote) && (
        <p className="mono fine-print">
          {researchSource === "scaffold" ? "Starter templates · " : "Researched by Hermes · "}
          {researchNote || "Review each item before posting."}
        </p>
      )}

      <div className="mono fine-print queue-x-status">
        X:{" "}
        {xHandle ? (
          `connected as ${xHandle} — you can post X drafts from here`
        ) : sessionDbId ? (
          <ConnectSocials sessionId={sessionDbId} platforms={["x"]} />
        ) : (
          "not connected"
        )}
      </div>

      {busy && researched.length === 0 && (
        <p className="muted" aria-live="polite">
          The Distribution manager is briefing a specialist for each surface. This can take a few
          minutes.
        </p>
      )}

      {!busy && opportunities.length === 0 && (
        <EmptyState title="No opportunities yet">
          Kami looks for live conversations on your approved surfaces and drafts a useful
          contribution for each.
        </EmptyState>
      )}

      {templates.length > 0 && (
        <button
          type="button"
          className="link-button mono"
          onClick={() => setShowTemplates((v) => !v)}
        >
          {showTemplates ? "Hide" : "Show"} {templates.length} template
          {templates.length === 1 ? "" : "s"} (not researched)
        </button>
      )}

      {!showTemplates && researched.length === 0 && templates.length > 0 && (
        <p className="muted">
          Research didn&apos;t find live opportunities this time, so Kami prepared starter
          templates. Show them, or try again later.
        </p>
      )}

      <div className="opportunity-list unfold-stagger">
        {visible.map((o) => (
          <OpportunityCard
            key={o.id}
            opportunity={o}
            canPostToX={Boolean(xHandle)}
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

      <ConfirmDialog
        open={Boolean(pendingPost)}
        title={`Post to X${xHandle ? ` as ${xHandle}` : ""}?`}
        body={pendingPost?.text}
        confirmLabel="Post to X"
        busy={Boolean(pendingPost && savingId === pendingPost.opportunity.id)}
        onConfirm={() => void publish()}
        onCancel={() => setPendingPost(null)}
      />
    </section>
  );
}
