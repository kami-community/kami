"use client";

import { companies, type PrimaryAction } from "./rules";

export type BusyMode = "discover" | "emails" | "continue" | null;

interface TargetActionsProps {
  primary: PrimaryAction;
  distributionPath: boolean;
  showDiscover: boolean;
  showDistribution: boolean;
  accountCount: number;
  includedCount: number;
  busyMode: BusyMode;
  paused: boolean;
  onDiscover: () => void;
  onFindEmails: () => void;
  onDraft: () => void;
  onCreateDistribution?: () => void;
}

/** The Find step's action bar. Exactly one button is primary (hanko) at a time. */
export default function TargetActions({
  primary,
  distributionPath,
  showDiscover,
  showDistribution,
  accountCount,
  includedCount,
  busyMode,
  paused,
  onDiscover,
  onFindEmails,
  onDraft,
  onCreateDistribution,
}: TargetActionsProps) {
  const busy = busyMode !== null;
  const cls = (action: PrimaryAction) => (primary === action ? "hanko-btn" : "btn-secondary");

  return (
    <div className="target-actions">
      <p className="label-caps">{distributionPath ? "Find people to reach" : "Find companies"}</p>
      <div className="target-actions__buttons">
        {showDiscover && (
          <button
            type="button"
            className={cls("discover")}
            onClick={onDiscover}
            disabled={busy || paused}
          >
            {busyMode === "discover" ? "Finding…" : "Find companies"}
          </button>
        )}
        {showDistribution && onCreateDistribution && (
          <button type="button" className={cls("distribution")} onClick={onCreateDistribution}>
            Create distribution
          </button>
        )}
        {!distributionPath && (
          <button
            type="button"
            className={cls("find_emails")}
            onClick={onFindEmails}
            disabled={busy || paused || !accountCount}
            title={
              accountCount
                ? "Site scrape + web search + Hermes — never invents emails"
                : "Available after companies are listed"
            }
          >
            {busyMode === "emails" ? "Looking up…" : "Find emails with Hermes"}
          </button>
        )}
        {includedCount > 0 && (
          <button type="button" className={cls("draft")} onClick={onDraft} disabled={busy}>
            {busyMode === "continue" ? "Building…" : `Draft emails for ${companies(includedCount)}`}
          </button>
        )}
      </div>
      {paused && (
        <p className="paused-banner" role="status">
          Sales is paused — resume to find companies or emails.
        </p>
      )}
      {!distributionPath && !accountCount && (
        <p className="mono muted target-hint">
          Find emails with Hermes is available after companies are listed.
        </p>
      )}
    </div>
  );
}
