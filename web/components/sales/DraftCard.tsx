"use client";

import { useState } from "react";
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
  busy: boolean;
  paused: boolean;
  onAction: (action: DraftAction) => void;
  onSave: (edits: { subject: string; body: string }) => Promise<boolean>;
}

export default function DraftCard({ draft, busy, paused, onAction, onSave }: DraftCardProps) {
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

  return (
    <article className="kraft-card draft">
      <header className="draft__head">
        <div>
          <p className="draft__to">{contact?.name ?? account?.name ?? "Unknown contact"}</p>
          <p className="mono fine-print">
            {hasEmail ? contact?.email : "No email — add one in Find companies"}
            {account?.name && contact?.name ? ` · ${account.name}` : ""} · email {draft.step} of 3
          </p>
        </div>
        <div className="draft__tags">
          {draft.draft_metadata?.source === "template" && (
            <span className="tag tag--muted">Template draft</span>
          )}
          {draft.status === "approved" && <span className="tag">Approved</span>}
        </div>
      </header>

      {editing ? (
        <div className="draft__editor">
          <div className="form-line">
            <label className="mono label-caps" htmlFor={`subject-${draft.id}`}>
              Subject ({subject.length}/60)
            </label>
            <input
              id={`subject-${draft.id}`}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="form-line">
            <label className="mono label-caps" htmlFor={`body-${draft.id}`}>
              Email ({words}/150 words)
            </label>
            <textarea
              id={`body-${draft.id}`}
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="draft__actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={save}
              disabled={busy || !subject.trim() || !body.trim()}
            >
              {busy ? "Saving…" : "Save and re-check"}
            </button>
            <button type="button" className="link-button mono" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="draft__email">
          <p className="draft__subject">{draft.draft_subject}</p>
          <pre className="draft__body">{draft.draft_body}</pre>
        </div>
      )}

      {draft.draft_metadata?.notes && (
        <p className="mono fine-print">{draft.draft_metadata.notes}</p>
      )}

      {verdict && (
        <div className={`draft__verdict${verdict.approved ? " draft__verdict--pass" : ""}`}>
          <p className="mono">
            {verdict.approved ? "✓ Passes review" : "Needs a few fixes before it can be approved:"}
          </p>
          {!verdict.approved && (
            <ul>
              {verdict.required_fixes.map((fix) => (
                <li key={fix}>{fix}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!editing && (
        <div className="draft__actions">
          {next && (
            <button
              type="button"
              className="btn-secondary"
              disabled={paused || busy || !hasEmail}
              onClick={() => onAction(next.action)}
            >
              {busy ? "Working…" : next.label}
            </button>
          )}
          <button
            type="button"
            className="btn-outline mono"
            onClick={() => setEditing(true)}
            disabled={busy}
          >
            Edit
          </button>
        </div>
      )}
    </article>
  );
}
