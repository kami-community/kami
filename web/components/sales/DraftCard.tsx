"use client";

import { useState } from "react";
import SelectionActions from "@/components/bui/SelectionActions";
import Button from "@/components/ui/Button";
import Card, { CardBar, CardBody, CardFooter } from "@/components/ui/Card";
import Field, { Input, Textarea } from "@/components/ui/Field";
import {
  IconCheck,
  IconEdit,
  IconMail,
  IconSend,
  IconShield,
  IconWarning,
} from "@/components/ui/icons";
import { EntityChip, StatusPill } from "@/components/ui/Pills";
import { api } from "@/lib/client/api";
import type { ReviewerVerdict } from "@/lib/salesTypes";

export interface DraftRow {
  id: string;
  step: number;
  status: string;
  draft_subject?: string;
  draft_body?: string;
  draft_cta?: string;
  draft_metadata?: { source?: "agent" | "template"; notes?: string | null } | null;
  reviewer_verdict?: ReviewerVerdict | null;
  approved_at?: string;
  sales_sequence_enrollments?: {
    status: string;
    sales_contacts?: { name?: string; email?: string };
    sales_accounts?: { name?: string; domain?: string };
  };
}

export type DraftAction = "review" | "approve" | "send";

/** The single next step for a draft: check it, approve it, then send it. */
export function nextAction(draft: DraftRow): { action: DraftAction; label: string } | null {
  if (draft.status === "approved") return { action: "send", label: "Send email…" };
  if (draft.reviewer_verdict?.approved) return { action: "approve", label: "Approve" };
  if (!draft.reviewer_verdict) return { action: "review", label: "Check draft" };
  return null; // reviewed and failing: edit it first
}

interface DraftCardProps {
  draft: DraftRow;
  sessionId: string;
  busy: boolean;
  paused: boolean;
  onAction: (action: DraftAction) => void;
  onSave: (edits: { subject: string; body: string }) => Promise<boolean>;
  /** this card holds the screen's one accent action (default true; lists pass false for all but one) */
  emphasis?: boolean;
}

export default function DraftCard({
  draft,
  sessionId,
  busy,
  paused,
  onAction,
  onSave,
  emphasis = true,
}: DraftCardProps) {
  const contact = draft.sales_sequence_enrollments?.sales_contacts;
  const account = draft.sales_sequence_enrollments?.sales_accounts;
  const verdict = draft.reviewer_verdict;
  const hasEmail = Boolean(contact?.email);
  const next = nextAction(draft);
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(draft.draft_subject ?? "");
  const [body, setBody] = useState(draft.draft_body ?? "");
  const words = body.trim().split(/\s+/).filter(Boolean).length;

  async function save() {
    if (await onSave({ subject, body })) setEditing(false);
  }

  const status =
    draft.status === "approved" ? (
      <StatusPill tone="green">Approved</StatusPill>
    ) : verdict?.approved ? (
      <StatusPill tone="accent">Passes review</StatusPill>
    ) : verdict ? (
      <StatusPill tone="orange">Needs fixes</StatusPill>
    ) : (
      <StatusPill>Unchecked</StatusPill>
    );

  return (
    <Card as="article" className="draft-card">
      <CardBar
        title={
          <span className="row draft-card__to">
            <span className="text-3">To</span>
            <EntityChip name={contact?.name ?? account?.name ?? "Unknown contact"} />
            {account?.name && contact?.name && account.name !== contact.name && (
              <span className="text-3 truncate">at {account.name}</span>
            )}
          </span>
        }
        icon={<IconMail size={13} />}
      >
        {draft.draft_metadata?.source === "template" && (
          <StatusPill dot={false}>Template</StatusPill>
        )}
        <span className="card__meta tabular">Email {draft.step} of 3</span>
        {status}
      </CardBar>

      {editing ? (
        <CardBody roomy className="form-stack">
          <Field
            label="Subject"
            aside={<span className="field__optional tabular">{subject.length}/60</span>}
          >
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field
            label="Email"
            aside={<span className="field__optional tabular">{words}/150 words</span>}
          >
            <Textarea rows={9} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
        </CardBody>
      ) : (
        <CardBody roomy className="stack stack--sm">
          <p className="draft-card__recipient mono">
            {hasEmail ? contact?.email : "No email yet. Add one under Companies."}
          </p>
          <p className="draft-card__subject">{draft.draft_subject}</p>
          <SelectionActions
            text={draft.draft_body ?? ""}
            disabled={draft.status === "sent" || busy}
            onRewrite={async ({ selection, instruction }) => {
              const { replacement } = await api.post<{ replacement: string }>(
                "/api/drafts/rewrite",
                {
                  session_id: sessionId,
                  subject: { type: "sales_touchpoint", id: draft.id },
                  selection,
                  instruction,
                },
              );
              return replacement;
            }}
            onCommit={async (nextBody) => {
              await onSave({ subject: draft.draft_subject ?? "", body: nextBody });
            }}
          />
          {draft.draft_metadata?.notes && (
            <p className="text-3 text-xs">{draft.draft_metadata.notes}</p>
          )}
        </CardBody>
      )}

      {verdict && !editing && (
        <div className={`draft-card__verdict${verdict.approved ? " is-pass" : ""}`}>
          {verdict.approved ? (
            <span className="row draft-card__verdict-head">
              <IconShield size={13} /> Passes the review
            </span>
          ) : (
            <>
              <span className="row draft-card__verdict-head">
                <IconWarning size={13} /> Needs a few fixes before it can be approved
              </span>
              <ul className="bullet-list">
                {verdict.required_fixes.map((fix) => (
                  <li key={fix}>{fix}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <CardFooter>
        {editing ? (
          <>
            <Button size="sm" variant="quiet" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant={emphasis ? "accent" : "secondary"}
              busy={busy}
              disabled={!subject.trim() || !body.trim()}
              onClick={() => void save()}
            >
              Save and re-check
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="quiet"
              icon={<IconEdit size={13} />}
              onClick={() => setEditing(true)}
              disabled={busy}
            >
              Edit
            </Button>
            {next ? (
              <Button
                size="sm"
                variant={next.action === "review" || !emphasis ? "secondary" : "accent"}
                icon={
                  next.action === "send" ? (
                    <IconSend size={13} />
                  ) : next.action === "approve" ? (
                    <IconCheck size={13} />
                  ) : undefined
                }
                busy={busy}
                disabled={paused || !hasEmail}
                onClick={() => onAction(next.action)}
              >
                {next.label}
              </Button>
            ) : (
              <span className="text-3 text-xs">Edit the draft to fix it, then re-check.</span>
            )}
          </>
        )}
      </CardFooter>
    </Card>
  );
}
