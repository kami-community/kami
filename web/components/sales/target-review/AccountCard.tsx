"use client";

import { useState } from "react";
import RecordsTable, {
  RecordLink,
  RecordTag,
  Strength,
  type RecordColumn,
} from "@/components/bui/RecordsTable";
import { IconCheck } from "@/components/ui/icons";
import EmptyState from "@/components/ui/EmptyState";
import { verificationLabel } from "@/lib/domain/contacts";
import type { SalesSegment } from "@/lib/domain/segments";
import { hasEligibleEmail, isIncluded, type AccountWithMeta } from "./rules";

function pctColor(v: number): string {
  return v >= 0.66 ? "var(--green)" : v >= 0.4 ? "var(--orange)" : "var(--red)";
}

interface AccountTableProps {
  accounts: AccountWithMeta[];
  segments?: SalesSegment[] | null;
  emailDrafts: Record<string, string>;
  savingEmailId: string | null;
  disabled: boolean;
  onToggle: (account: AccountWithMeta, included: boolean) => void;
  onEmailDraft: (accountId: string, value: string) => void;
  onSaveEmail: (account: AccountWithMeta) => void;
}

/**
 * Companies as a records grid. Selecting a row includes the company in the
 * draft cohort (stored server-side); selected companies without an evidenced
 * email get an inline field — Kami never invents one.
 */
export function AccountTable({
  accounts,
  segments,
  emailDrafts,
  savingEmailId,
  disabled,
  onToggle,
  onEmailDraft,
  onSaveEmail,
}: AccountTableProps) {
  const [pending, setPending] = useState<Set<string>>(new Set());
  if (!accounts.length) {
    return (
      <EmptyState title="No companies yet">
        Use Find companies to check the companies in your plan.
      </EmptyState>
    );
  }

  const rows = accounts.filter((a) => a.id);
  const selected = new Set(rows.filter((a) => isIncluded(a)).map((a) => a.id!));
  for (const id of pending) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
  }

  const segmentName = (a: AccountWithMeta) =>
    segments?.find((s) => s.key === a.segment_key)?.name ?? a.industry ?? "Other";

  const columns: RecordColumn<AccountWithMeta>[] = [
    {
      key: "segment",
      label: "Group",
      width: 170,
      render: (a) => <RecordTag name={segmentName(a)} />,
      sort: (x, y) => segmentName(x).localeCompare(segmentName(y)),
    },
    {
      key: "fit",
      label: "Fit",
      width: 110,
      render: (a) =>
        a.score ? (
          <Strength color={pctColor(a.score.factors.fit)}>
            {Math.round(a.score.factors.fit * 100)}%
          </Strength>
        ) : (
          <span className="records-muted">—</span>
        ),
      sort: (x, y) => (x.score?.factors.fit ?? 0) - (y.score?.factors.fit ?? 0),
      footer: (all) => {
        const scored = all.filter((a) => a.score);
        if (!scored.length) return "—";
        return `${Math.round((scored.reduce((n, a) => n + a.score!.factors.fit, 0) / scored.length) * 100)}% avg`;
      },
    },
    {
      key: "timing",
      label: "Timing",
      width: 110,
      render: (a) =>
        a.score ? (
          <Strength color={pctColor(a.score.factors.intent)}>
            {Math.round(a.score.factors.intent * 100)}%
          </Strength>
        ) : (
          <span className="records-muted">—</span>
        ),
      sort: (x, y) => (x.score?.factors.intent ?? 0) - (y.score?.factors.intent ?? 0),
    },
    {
      key: "contact",
      label: "Contact email",
      width: 260,
      minWidth: 200,
      render: (a) => {
        if (a.contact?.email) {
          const v = verificationLabel(a.contact.email_verification);
          return (
            <span className="records-strength" title={v ?? undefined}>
              <span
                className="records-strength-dot"
                style={{ background: hasEligibleEmail(a) ? "var(--green)" : "var(--orange)" }}
              />
              <span className="truncate">{a.contact.email}</span>
            </span>
          );
        }
        if (!selected.has(a.id!)) return <span className="records-muted">No email yet</span>;
        return (
          <form
            className="records-email"
            onSubmit={(e) => {
              e.preventDefault();
              onSaveEmail(a);
            }}
          >
            <input
              type="email"
              autoComplete="off"
              placeholder="name@company.com"
              aria-label={`Contact email for ${a.name}`}
              value={emailDrafts[a.id!] ?? ""}
              onChange={(e) => onEmailDraft(a.id!, e.target.value)}
              className="input input--sm"
            />
            <button
              type="submit"
              className="icon-btn icon-btn--sm"
              aria-label={`Save email for ${a.name}`}
              disabled={savingEmailId === a.id || !(emailDrafts[a.id!] ?? "").trim()}
            >
              {savingEmailId === a.id ? <span className="spinner" /> : <IconCheck size={13} />}
            </button>
          </form>
        );
      },
      footer: (all) => `${all.filter((a) => a.contact?.email).length} with email`,
    },
    {
      key: "signal",
      label: "Why now",
      width: 300,
      render: (a) => {
        const sig = a.signals?.[0];
        const text = sig?.detail ?? a.score?.explanation;
        if (!text) return <span className="records-muted">—</span>;
        return (
          <span
            className="records-signal"
            title={[text, ...(a.signals ?? []).slice(1).map((s) => s.detail)].join("\n")}
          >
            <span className="truncate">{text}</span>
            {sig?.source_url && <RecordLink href={sig.source_url} label="source" />}
          </span>
        );
      },
      footer: (all) => `${all.reduce((n, a) => n + (a.signals?.length ?? 0), 0)} signals`,
    },
  ];

  return (
    <RecordsTable
      label="Companies. Select a row to include it in the email drafts."
      rows={rows}
      rowId={(a) => a.id!}
      anchor={{
        label: "Company",
        width: 250,
        name: (a) => a.name,
        href: (a) => (a.domain ? `https://${a.domain}` : null),
        sort: (x, y) => x.name.localeCompare(y.name),
      }}
      columns={columns}
      selected={selected}
      onSelectedChange={(next) => {
        if (disabled) return;
        for (const a of rows) {
          const was = selected.has(a.id!);
          const now = next.has(a.id!);
          if (was !== now) {
            setPending((p) => new Set(p).add(a.id!));
            void Promise.resolve(onToggle(a, now)).finally(() =>
              setPending((p) => {
                const n = new Set(p);
                n.delete(a.id!);
                return n;
              }),
            );
          }
        }
      }}
      countLabel={`companies · ${selected.size} selected`}
    />
  );
}
