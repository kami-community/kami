"use client";

import { useState } from "react";
import SelectionActions from "@/components/bui/SelectionActions";
import { PlatformMark, PLATFORM_LABELS } from "@/components/marketing/platforms";
import Button from "@/components/ui/Button";
import Card, { CardBar, CardBody, CardFooter } from "@/components/ui/Card";
import Field, { Textarea } from "@/components/ui/Field";
import {
  IconArrowUpRight,
  IconCheck,
  IconCopy,
  IconEdit,
  IconSend,
  IconWarning,
} from "@/components/ui/icons";
import { StatusPill } from "@/components/ui/Pills";
import { api } from "@/lib/client/api";
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
  sessionId: string;
  canPostToX: boolean;
  saving: boolean;
  flash?: string;
  onSave: (edits: Record<string, unknown>, message: string) => void;
  onPostToX: (text: string) => void;
}

export default function OpportunityCard({
  opportunity: o,
  sessionId,
  canPostToX,
  saving,
  flash,
  onSave,
  onPostToX,
}: OpportunityCardProps) {
  const [draft, setDraft] = useState(o.draft);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);
  const template = isTemplate(o);
  const published = o.action_status === "published";
  const postedManually = o.action_status === "posted_manual";
  const outcome = OUTCOMES.find((x) => x.key === o.outcome);
  const xPostable = o.platform === "x" && canPostToX && !published;
  const done = published || postedManually;

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied("yes");
    } catch {
      // Clipboard blocked (permissions, insecure origin): say so — the draft is still selectable.
      setCopied("failed");
    }
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <Card as="article" className={`opp${template ? " opp--template" : ""}`}>
      <CardBar
        title={PLATFORM_LABELS[o.platform] ?? o.platform}
        icon={<PlatformMark platform={o.platform} size={18} />}
      >
        {template && <StatusPill tone="orange">Template — not researched</StatusPill>}
        {published && <StatusPill tone="green">Posted</StatusPill>}
        {postedManually && <StatusPill tone="green">Posted by you</StatusPill>}
        {!done && !template && o.approval_status === "needs_review" && (
          <StatusPill tone="accent">Needs review</StatusPill>
        )}
      </CardBar>

      <CardBody roomy className="stack stack--sm">
        <dl className="opp__brief">
          <dt>Why now</dt>
          <dd>{o.why_now}</dd>
          <dt>Do</dt>
          <dd>{o.suggested_action}</dd>
        </dl>

        <div className="opp__draft">
          {editing ? (
            <Field
              label="Draft"
              aside={
                <span className="field__optional tabular">
                  {draft.trim().length}
                  {o.platform === "x" ? "/280" : ""}
                </span>
              }
            >
              <Textarea rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} />
            </Field>
          ) : (
            <SelectionActions
              text={draft}
              disabled={done || saving}
              onRewrite={async ({ selection, instruction }) => {
                const { replacement } = await api.post<{ replacement: string }>(
                  "/api/drafts/rewrite",
                  {
                    session_id: sessionId,
                    subject: { type: "distribution_opportunity", id: o.id },
                    selection,
                    instruction,
                  },
                );
                return replacement;
              }}
              onCommit={(next) => {
                setDraft(next);
                onSave({ draft: next }, "Draft updated.");
              }}
            />
          )}
        </div>

        {o.risks && (
          <p className="opp__risk">
            <IconWarning size={12} /> {o.risks}
          </p>
        )}

        <p className="opp__meta">
          {o.source_url.startsWith("http") ? (
            <a className="records-link" href={o.source_url} target="_blank" rel="noreferrer">
              Source thread <IconArrowUpRight size={11} />
            </a>
          ) : (
            <span>Paste the thread you choose when you post.</span>
          )}
          {o.published_url && (
            <a className="records-link" href={o.published_url} target="_blank" rel="noreferrer">
              Live post <IconArrowUpRight size={11} />
            </a>
          )}
          {!template && o.format_used && (
            <span title={o.format_why ?? undefined}>Format: {o.format_used}</span>
          )}
        </p>

        {done && (
          <div className="opp__outcomes" role="group" aria-label="What happened?">
            <span className="opp__label">What happened?</span>
            {OUTCOMES.filter((x) => x.key !== "skipped").map((out) => (
              <button
                key={out.key}
                type="button"
                className="filter-chip"
                aria-pressed={o.outcome === out.key}
                disabled={saving}
                onClick={() => onSave({ outcome: out.key }, out.next)}
              >
                {out.label}
              </button>
            ))}
          </div>
        )}

        {(flash || (o.outcome !== "none" && outcome)) && (
          <p className="text-3 text-xs" role="status">
            {flash ?? outcome?.next}
          </p>
        )}
      </CardBody>

      <CardFooter>
        <span className="row opp__tools">
          {!done && (
            <Button
              size="sm"
              variant="quiet"
              icon={<IconEdit size={13} />}
              onClick={() => {
                if (editing && draft !== o.draft) onSave({ draft }, "Draft saved.");
                setEditing((e) => !e);
              }}
              disabled={saving}
            >
              {editing ? "Save draft" : "Edit"}
            </Button>
          )}
          <Button
            size="sm"
            variant="quiet"
            icon={copied === "yes" ? <IconCheck size={13} /> : <IconCopy size={13} />}
            onClick={() => void copy()}
          >
            {copied === "yes"
              ? "Copied"
              : copied === "failed"
                ? "Copy blocked — select the text"
                : "Copy"}
          </Button>
          {!done && (
            <Button
              size="sm"
              variant="quiet"
              disabled={saving}
              onClick={() =>
                onSave(
                  { approval_status: "skipped", outcome: "skipped", action_status: "draft" },
                  "Skipped.",
                )
              }
            >
              Skip
            </Button>
          )}
          {!done && xPostable && (
            <Button
              size="sm"
              variant="quiet"
              disabled={saving}
              onClick={() =>
                onSave(
                  {
                    approval_status: "approved",
                    action_status: "posted_manual",
                    outcome: "posted",
                  },
                  "Marked as posted.",
                )
              }
            >
              I posted it myself
            </Button>
          )}
        </span>
        {!done &&
          (xPostable ? (
            <Button
              size="sm"
              variant="secondary"
              icon={<IconSend size={13} />}
              busy={saving}
              onClick={() => onPostToX(draft)}
            >
              Post to X…
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              icon={<IconCheck size={13} />}
              busy={saving}
              onClick={() =>
                onSave(
                  {
                    approval_status: "approved",
                    action_status: "posted_manual",
                    outcome: "posted",
                  },
                  "Marked as posted.",
                )
              }
            >
              I posted this
            </Button>
          ))}
      </CardFooter>
    </Card>
  );
}
