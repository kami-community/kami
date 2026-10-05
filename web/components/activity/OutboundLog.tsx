"use client";

import { useState } from "react";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type { OutboundReceipt } from "@/lib/outbound/receipts";

const CHANNEL_LABEL: Record<OutboundReceipt["channel"], string> = {
  email: "Email",
  x_post: "X post",
  x_dm: "X DM",
  ig_dm: "Instagram DM",
};

/** Every real send, post and DM, with proof (provider id or URL) and replies. */
export default function OutboundLog({ sessionId }: { sessionId: string }) {
  const { data, error, loading, reload } = useApi<{ receipts: OutboundReceipt[] }>(
    withQuery("/api/outbound", { session_id: sessionId }),
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    setRefreshNote(null);
    const results = await Promise.allSettled([
      api.post("/api/marketing/x/engagement", { session_id: sessionId }),
      api.post("/api/jobs/email-replies"),
    ]);
    const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    setRefreshNote(
      failures.length ? failures.map((f) => errorMessage(f.reason)).join(" · ") : "Up to date.",
    );
    setRefreshing(false);
    reload();
  }

  const receipts = data?.receipts ?? [];

  return (
    <section>
      <div className="section-head">
        <p className="label-caps">Outbound ledger</p>
        <button type="button" className="mono btn-outline" onClick={refresh} disabled={refreshing}>
          {refreshing ? "Checking replies…" : "↻ Check replies & engagement"}
        </button>
      </div>
      {refreshNote && <p className="mono meta-line">{refreshNote}</p>}
      {loading && <p className="muted">Loading…</p>}
      {error && (
        <p role="alert" className="mono form-error">
          {error}
        </p>
      )}
      {!loading && !error && receipts.length === 0 && (
        <p className="muted">
          Nothing has been sent yet. Approved sends and posts appear here with proof.
        </p>
      )}
      <ul className="row-list">
        {receipts.map((r) => (
          <li key={r.id} className="row">
            <button
              type="button"
              className="row__summary"
              aria-expanded={expanded === r.id}
              onClick={() => setExpanded((id) => (id === r.id ? null : r.id))}
            >
              <span className={`status-pill status-pill--${r.status}`}>{r.status}</span>
              <span className="mono">{CHANNEL_LABEL[r.channel]}</span>
              <span className="row__title">{r.recipient ?? r.sent_as ?? "public post"}</span>
              {r.replies.length > 0 && (
                <span className="mono">
                  {r.replies.length} repl{r.replies.length === 1 ? "y" : "ies"}
                </span>
              )}
              <span className="mono muted">
                {new Date(r.sent_at ?? r.created_at).toLocaleString()}
              </span>
            </button>
            {expanded === r.id && (
              <div className="row__detail">
                <pre className="mono">{r.content}</pre>
                <p className="mono meta-line">
                  {r.provider} ·{" "}
                  {r.provider_message_id ? `id ${r.provider_message_id}` : "no provider id"}
                  {r.url && (
                    <>
                      {" · "}
                      <a href={r.url} target="_blank" rel="noreferrer">
                        open
                      </a>
                    </>
                  )}
                  {r.metrics &&
                    ` · ${Object.entries(r.metrics)
                      .map(([k, v]) => `${k.replace(/_count$/, "")} ${v}`)
                      .join(", ")}`}
                </p>
                {r.error && <p className="mono form-error">{r.error}</p>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
