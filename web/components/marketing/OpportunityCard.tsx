"use client";

import { useState } from "react";
import Seal from "@/components/ui/Seal";
import type { DistributionOpportunity, DistributionOutcome } from "@/lib/distributionTypes";

export const OUTCOMES: { key: DistributionOutcome; label: string; next: string }[] = [
  { key: "posted", label: "Posted", next: "Logged — keep watching for replies." },
  { key: "got_reply", label: "Got a reply", next: "Note what they asked and reply personally." },
  { key: "got_interest", label: "Got interest", next: "Follow up with one clear next step." },
  { key: "got_signup", label: "Got a signup", next: "Great — move them into onboarding." },
  { key: "not_relevant", label: "Not relevant", next: "Kami won't push this angle again." },
  { key: "skipped", label: "Skipped", next: "Marked skipped." },
];

/** Template rows are starters, not research: hidden by default and clearly badged. */
export function isTemplate(o: DistributionOpportunity): boolean {
  return o.agent_skill === "scaffold" || /\[source=scaffold\]/i.test(o.evidence ?? "");
}

interface OpportunityCardProps {
  opportunity: DistributionOpportunity;
  canPostToX: boolean;
  saving: boolean;
  flash?: string;
  onSave: (edits: Record<string, unknown>, message: string) => void;
  onPostToX: (text: string) => void;
}

export default function OpportunityCard({
  opportunity: o,
  canPostToX,
  saving,
  flash,
  onSave,
  onPostToX,
}: OpportunityCardProps) {
  const [draft, setDraft] = useState(o.draft);
  const [copied, setCopied] = useState(false);
  const template = isTemplate(o);
  const published = o.action_status === "published";
  const outcome = OUTCOMES.find((x) => x.key === o.outcome);
  const editable = o.platform === "x" && canPostToX && !published;

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable: the draft is still selectable */
    }
  }

  return (
    <article className={`kraft-card opportunity${template ? " opportunity--template" : ""}`}>
      <header className="opportunity__head">
        <p className="label-caps">{o.platform}</p>
        {template && <span className="tag tag--muted">Template — not researched</span>}
        {published && <Seal tone="moss">Posted</Seal>}
        {!published && o.action_status === "posted_manual" && (
          <span className="tag">Posted by you</span>
        )}
      </header>

      <p>
        <strong>Why now:</strong> {o.why_now}
      </p>
      <p className="muted">
        <strong>Action:</strong> {o.suggested_action}
      </p>
      {(o.format_used || o.format_why) && !template && (
        <p className="mono fine-print">
          Format: {o.format_used || "—"}
          {o.format_why ? ` — ${o.format_why}` : ""}
        </p>
      )}
      {o.risks && <p className="mono fine-print opportunity__risk">Rules and risks: {o.risks}</p>}

      {editable ? (
        <div className="form-line opportunity__draft">
          <label className="mono label-caps" htmlFor={`draft-${o.id}`}>
            Draft ({draft.trim().length}/280)
          </label>
          <textarea
            id={`draft-${o.id}`}
            value={draft}
            rows={4}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>
      ) : (
        <pre className="opportunity__draft opportunity__draft--read">{o.draft}</pre>
      )}

      <p className="mono fine-print">
        Source:{" "}
        {o.source_url.startsWith("http") ? (
          <a href={o.source_url} target="_blank" rel="noreferrer">
            {o.source_url}
          </a>
        ) : (
          "paste the thread you choose when you post"
        )}
        {o.published_url && (
          <>
            {" · "}
            <a href={o.published_url} target="_blank" rel="noreferrer">
              live post
            </a>
          </>
        )}
      </p>

      <div className="opportunity__actions">
        {editable && (
          <button
            type="button"
            className="btn-secondary"
            disabled={saving}
            onClick={() => onPostToX(draft)}
          >
            Post to X…
          </button>
        )}
        <button type="button" className="btn-outline mono" onClick={copy}>
          {copied ? "Copied" : "Copy draft"}
        </button>
        {!published && (
          <button
            type="button"
            className="btn-outline mono"
            disabled={saving}
            onClick={() =>
              onSave(
                { approval_status: "approved", action_status: "posted_manual", outcome: "posted" },
                "Marked as posted.",
              )
            }
          >
            I posted this
          </button>
        )}
        <button
          type="button"
          className="link-button mono"
          disabled={saving}
          onClick={() =>
            onSave(
              { approval_status: "skipped", outcome: "skipped", action_status: "draft" },
              "Skipped.",
            )
          }
        >
          Skip
        </button>
      </div>

      <fieldset className="opportunity__outcomes">
        <legend className="mono label-caps">What happened?</legend>
        {OUTCOMES.map((out) => (
          <button
            key={out.key}
            type="button"
            className="chip mono"
            aria-pressed={o.outcome === out.key}
            disabled={saving}
            onClick={() => onSave({ outcome: out.key }, out.next)}
          >
            {out.label}
          </button>
        ))}
      </fieldset>

      {(flash || (o.outcome !== "none" && outcome)) && (
        <p className="mono fine-print" role="status">
          {flash ?? outcome?.next}
        </p>
      )}
    </article>
  );
}
