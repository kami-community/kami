"use client";

import { verificationLabel } from "@/lib/domain/contacts";
import type { SalesSegment } from "@/lib/domain/segments";
import { scoreLabel } from "@/lib/salesMotionLabels";
import { groupAccounts, hasEligibleEmail, isIncluded, type AccountWithMeta } from "./rules";

interface AccountCardProps {
  account: AccountWithMeta;
  emailDraft: string;
  saving: boolean;
  disabled: boolean;
  onToggle: (included: boolean) => void;
  onEmailDraft: (value: string) => void;
  onSaveEmail: () => void;
}

export function AccountCard({
  account,
  emailDraft,
  saving,
  disabled,
  onToggle,
  onEmailDraft,
  onSaveEmail,
}: AccountCardProps) {
  const selected = isIncluded(account);
  const factors = account.score?.factors;
  const emailId = `contact-email-${account.id}`;
  const verification = verificationLabel(account.contact?.email_verification);

  return (
    <article className="target-card" data-selected={selected}>
      <div className="target-card__head">
        <div>
          <strong>{account.name}</strong>
          {account.domain && (
            <span className="mono muted target-card__domain">{account.domain}</span>
          )}
        </div>
        <label className="checkbox mono">
          <input
            type="checkbox"
            checked={selected}
            disabled={disabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          Include
        </label>
      </div>

      {factors && (
        <p className="mono muted target-card__scores">
          {scoreLabel("fit", factors.fit)} · {scoreLabel("intent", factors.intent)} ·{" "}
          {scoreLabel("contactability", factors.contactability)}
        </p>
      )}
      {account.score?.explanation && (
        <p className="muted target-card__explanation">{account.score.explanation}</p>
      )}

      {account.signals?.length ? (
        <ul className="target-card__signals">
          {account.signals.map((sig, i) => (
            <li key={sig.id ?? `${sig.source_url}-${i}`}>
              {sig.detail ?? sig.signal_type}
              {sig.source_url && (
                <>
                  {" — "}
                  <a href={sig.source_url} target="_blank" rel="noopener noreferrer">
                    source
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {selected && (
        <div className="sales-inline-email">
          {account.contact?.email && (
            <span className="mono target-card__email">
              Email: {account.contact.email}
              {verification && <span className="muted"> ({verification})</span>}
            </span>
          )}
          {!hasEligibleEmail(account) && (
            <>
              <label className="label-caps" htmlFor={emailId}>
                Contact email
              </label>
              <input
                id={emailId}
                type="email"
                autoComplete="off"
                placeholder="name@company.com"
                value={emailDraft}
                onChange={(e) => onEmailDraft(e.target.value)}
              />
              <button
                type="button"
                className="btn-outline"
                disabled={saving || !emailDraft.trim()}
                onClick={onSaveEmail}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}

interface AccountGroupsProps {
  accounts: AccountWithMeta[];
  segments?: SalesSegment[] | null;
  emailDrafts: Record<string, string>;
  savingEmailId: string | null;
  disabled: boolean;
  onToggle: (account: AccountWithMeta, included: boolean) => void;
  onEmailDraft: (accountId: string, value: string) => void;
  onSaveEmail: (account: AccountWithMeta) => void;
}

export function AccountGroups({
  accounts,
  segments,
  emailDrafts,
  savingEmailId,
  disabled,
  onToggle,
  onEmailDraft,
  onSaveEmail,
}: AccountGroupsProps) {
  if (!accounts.length) {
    return (
      <p className="mono muted target-empty">
        No companies yet — click Find companies to verify targets from your confirmed segments.
      </p>
    );
  }
  return (
    <div className="target-groups">
      {groupAccounts(accounts).map(([groupKey, groupAccounts]) => (
        <section key={groupKey}>
          <p className="label-caps">
            {segments?.find((s) => s.key === groupKey)?.name ?? groupKey}
          </p>
          <div className="target-group">
            {groupAccounts.map((acc) => (
              <AccountCard
                key={acc.id}
                account={acc}
                emailDraft={emailDrafts[acc.id ?? ""] ?? ""}
                saving={savingEmailId === acc.id}
                disabled={disabled}
                onToggle={(included) => onToggle(acc, included)}
                onEmailDraft={(value) => acc.id && onEmailDraft(acc.id, value)}
                onSaveEmail={() => onSaveEmail(acc)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
