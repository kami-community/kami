"use client";

import ConnectSocials, { useConnections } from "@/components/ConnectSocials";
import { useState } from "react";
import type { DistributionOpportunity, DistributionOutcome } from "@/lib/distributionTypes";

interface OpportunityQueueProps {
  opportunities: DistributionOpportunity[];
  sessionDbId: string | null;
  researchNote?: string | null;
  researchSource?: string | null;
  busy?: boolean;
  onRefresh: () => void;
  onResearch: () => void;
}

const OUTCOMES: { key: DistributionOutcome; label: string; next?: string }[] = [
  { key: "posted", label: "Posted", next: "Logged — keep watching for replies." },
  {
    key: "got_reply",
    label: "Got a reply",
    next: "Nice — note what they asked and reply personally.",
  },
  { key: "got_interest", label: "Got interest", next: "Follow up with one clear next step." },
  { key: "got_signup", label: "Got a signup", next: "Great — move them into onboarding." },
  {
    key: "not_relevant",
    label: "Not relevant",
    next: "Skipped for learning — we won’t push this angle.",
  },
  { key: "skipped", label: "Skipped", next: "Marked skipped." },
];

export default function OpportunityQueue({
  opportunities,
  sessionDbId,
  researchNote,
  researchSource,
  busy,
  onRefresh,
  onResearch,
}: OpportunityQueueProps) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Record<string, string>>({});
  const [localOutcomes, setLocalOutcomes] = useState<Record<string, DistributionOutcome>>({});
  const { handleOf } = useConnections(sessionDbId);
  const xHandle = handleOf("x");
  const xConnected = Boolean(xHandle);
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});
  const [confirmPostId, setConfirmPostId] = useState<string | null>(null);

  async function patch(id: string, body: Record<string, unknown>, successMsg?: string) {
    if (!sessionDbId) return false;
    setSavingId(id);
    try {
      const res = await fetch("/api/marketing/distribution/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionDbId, id, ...body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFlash((f) => ({ ...f, [id]: json.error ?? "Could not save — try again." }));
        return false;
      }
      if (typeof body.outcome === "string") {
        setLocalOutcomes((o) => ({ ...o, [id]: body.outcome as DistributionOutcome }));
      }
      setFlash((f) => ({ ...f, [id]: successMsg ?? "Saved." }));
      onRefresh();
      return true;
    } finally {
      setSavingId(null);
    }
  }

  async function copyDraft(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }

  async function postToX(o: DistributionOpportunity) {
    if (!sessionDbId) return;
    const text = (draftEdits[o.id] ?? o.draft).trim();
    if (!text) {
      setFlash((f) => ({ ...f, [o.id]: "Draft is empty." }));
      return;
    }
    if (
      !window.confirm(`Post this to X${xHandle ? ` as ${xHandle}` : ""}?\n\n${text.slice(0, 280)}`)
    ) {
      return;
    }
    setSavingId(o.id);
    setConfirmPostId(null);
    try {
      const res = await fetch(`/api/marketing/distribution/opportunities/${o.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionDbId, text }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFlash((f) => ({ ...f, [o.id]: json.error ?? "X post failed" }));
        return;
      }
      setFlash((f) => ({ ...f, [o.id]: json.url ? `Posted to X — ${json.url}` : "Posted to X." }));
      onRefresh();
    } catch (e) {
      setFlash((f) => ({
        ...f,
        [o.id]: e instanceof Error ? e.message : "X post failed",
      }));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--stack-sm)",
        }}
      >
        <p className="label-caps">Today&apos;s distribution opportunities</p>
        <button
          type="button"
          className="hanko-btn"
          onClick={onResearch}
          disabled={busy || !sessionDbId}
        >
          {busy ? "Researching…" : "Find opportunities"}
        </button>
      </div>

      {(researchSource || researchNote) && (
        <p
          className="mono"
          style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: "var(--stack-sm)" }}
        >
          {researchSource === "scaffold" ? "Starter queue · " : "Hermes · "}
          {researchNote || "Review each item before posting."}
        </p>
      )}

      <p
        className="mono"
        style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: "var(--stack-sm)" }}
      >
        X:{" "}
        {xConnected ? (
          `connected${xHandle ? ` (${xHandle})` : ""} — Post to X available on X drafts`
        ) : sessionDbId ? (
          <ConnectSocials sessionId={sessionDbId} platforms={["x"]} />
        ) : (
          "not connected"
        )}
      </p>

      {opportunities.length === 0 && (
        <p style={{ color: "var(--ink-soft)" }}>
          No opportunities yet. Click <strong>Find opportunities</strong> for a short, reviewable
          queue.
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack-sm)" }}>
        {opportunities.map((o) => {
          const outcome = localOutcomes[o.id] ?? o.outcome;
          const outcomeMeta = OUTCOMES.find((x) => x.key === outcome);
          const draft = draftEdits[o.id] ?? o.draft;
          const isX = o.platform === "x";

          return (
            <div key={o.id} className="kraft-card" style={{ padding: "var(--stack-md)" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <p className="label-caps">{o.platform}</p>
                <span className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  {o.approval_status} · {o.action_status}
                </span>
              </div>
              <p style={{ marginTop: "0.5rem" }}>
                <strong>Why now:</strong> {o.why_now}
              </p>
              <p style={{ marginTop: "0.35rem", color: "var(--ink-soft)" }}>
                <strong>Action:</strong> {o.suggested_action}
              </p>
              {o.risks && (
                <p
                  className="mono"
                  style={{ fontSize: 12, marginTop: "0.35rem", color: "var(--hanko)" }}
                >
                  Risk / rules: {o.risks}
                </p>
              )}
              {isX && xConnected ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraftEdits((d) => ({ ...d, [o.id]: e.target.value }))}
                  rows={4}
                  style={{
                    width: "100%",
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    border: "1px solid var(--outline)",
                    padding: "0.75rem",
                    marginTop: "0.75rem",
                    background: "var(--paper)",
                    color: "var(--ink)",
                  }}
                />
              ) : (
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    background: "var(--paper-deep, transparent)",
                    border: "1px solid var(--outline)",
                    padding: "0.75rem",
                    marginTop: "0.75rem",
                  }}
                >
                  {o.draft}
                </pre>
              )}
              <p className="mono" style={{ fontSize: 12, marginTop: "0.5rem" }}>
                Source:{" "}
                {o.source_url.startsWith("http") ? (
                  <a href={o.source_url} target="_blank" rel="noreferrer">
                    {o.source_url}
                  </a>
                ) : (
                  o.source_url
                )}
              </p>
              {o.published_url && (
                <p className="mono" style={{ fontSize: 12, marginTop: "0.35rem" }}>
                  Live:{" "}
                  <a href={o.published_url} target="_blank" rel="noreferrer">
                    {o.published_url}
                  </a>
                </p>
              )}

              <div
                style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.75rem" }}
              >
                <button
                  type="button"
                  className="hanko-btn"
                  onClick={() => copyDraft(draft)}
                  disabled={savingId === o.id}
                >
                  Copy draft
                </button>
                {isX && xConnected && o.action_status !== "published" && (
                  <button
                    type="button"
                    className="hanko-btn"
                    onClick={() => setConfirmPostId(confirmPostId === o.id ? null : o.id)}
                    disabled={savingId === o.id}
                  >
                    {confirmPostId === o.id ? "Cancel" : "Post to X"}
                  </button>
                )}
                <button
                  type="button"
                  className="mono"
                  style={{
                    border: "1px solid var(--ink)",
                    background: "transparent",
                    padding: "0.4rem 0.75rem",
                    cursor: "pointer",
                  }}
                  onClick={() =>
                    patch(
                      o.id,
                      {
                        approval_status: "approved",
                        action_status: "posted_manual",
                        outcome: "posted",
                      },
                      "Marked as posted.",
                    )
                  }
                  disabled={savingId === o.id}
                >
                  I posted this
                </button>
                <button
                  type="button"
                  className="mono"
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    color: "var(--ink-soft)",
                  }}
                  onClick={() =>
                    patch(
                      o.id,
                      { approval_status: "skipped", outcome: "skipped", action_status: "draft" },
                      "Skipped.",
                    )
                  }
                  disabled={savingId === o.id}
                >
                  Skip
                </button>
              </div>

              {confirmPostId === o.id && (
                <div
                  style={{
                    marginTop: "0.75rem",
                    padding: "0.75rem",
                    border: "1px solid var(--hanko)",
                    background: "var(--kraft)",
                  }}
                >
                  <p style={{ fontSize: 14, marginBottom: "0.5rem" }}>
                    Review the draft above, then confirm. Kami will publish with your connected X
                    account.
                  </p>
                  <button
                    type="button"
                    className="hanko-btn"
                    onClick={() => postToX(o)}
                    disabled={savingId === o.id}
                  >
                    {savingId === o.id ? "Posting…" : "Confirm & post to X"}
                  </button>
                </div>
              )}

              <div
                style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.75rem" }}
              >
                <span className="mono label-caps" style={{ width: "100%" }}>
                  What happened?
                </span>
                {OUTCOMES.map((out) => (
                  <button
                    key={out.key}
                    type="button"
                    className="mono"
                    style={{
                      fontSize: 11,
                      border:
                        outcome === out.key ? "1px solid var(--hanko)" : "1px solid var(--outline)",
                      background: outcome === out.key ? "var(--kraft)" : "transparent",
                      padding: "0.25rem 0.5rem",
                      cursor: "pointer",
                    }}
                    onClick={() => patch(o.id, { outcome: out.key }, out.next ?? "Saved.")}
                    disabled={savingId === o.id}
                  >
                    {out.label}
                  </button>
                ))}
              </div>
              {flash[o.id] && (
                <p
                  className="mono"
                  style={{ fontSize: 12, color: "var(--hanko)", marginTop: "0.5rem" }}
                >
                  {flash[o.id]}
                  {outcomeMeta?.next && flash[o.id] === outcomeMeta.next ? null : null}
                </p>
              )}
              {outcome !== "none" && outcomeMeta?.next && !flash[o.id] && (
                <p
                  className="mono"
                  style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: "0.5rem" }}
                >
                  {outcomeMeta.next}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
