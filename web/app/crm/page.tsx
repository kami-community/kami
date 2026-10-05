"use client";

import { useEffect, useState } from "react";

interface OutreachRow {
  id: string;
  surface: string;
  draft: string | null;
  status: string;
  receipt: Record<string, unknown> | null;
  sent_at: string | null;
  created_at: string;
  contacts: {
    name: string | null;
    handle: string | null;
    platform: string;
    company: string | null;
    title: string | null;
  } | null;
  agent_sessions: { domain: string } | null;
}

interface Suppressed {
  id: string;
  handle: string;
  reason: string | null;
}

const STATUSES = ["all", "drafted", "approved", "sent", "replied", "bounced"];

const STATUS_COLOR: Record<string, string> = {
  drafted: "var(--outline)",
  approved: "var(--hanko)",
  sent: "var(--moss)",
  replied: "var(--moss)",
  bounced: "var(--ink)",
};

export default function CrmPage() {
  const [rows, setRows] = useState<OutreachRow[]>([]);
  const [suppressed, setSuppressed] = useState<Suppressed[]>([]);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  function load() {
    const qs = filter === "all" ? "" : `?status=${filter}`;
    fetch(`/api/crm${qs}`)
      .then((r) => r.json())
      .then((json) => {
        setRows(json.outreach ?? []);
        setSuppressed(json.suppressed ?? []);
      })
      .catch(() => {});
  }

  useEffect(load, [filter]);

  async function refreshEngagement() {
    setRefreshing(true);
    try {
      await Promise.all([
        fetch("/api/x/monitor", { method: "POST" }),
        fetch("/api/email/monitor", { method: "POST" }),
      ]);
      load();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <main className="container-wide" style={{ paddingBottom: "var(--stack-lg)" }}>
      <div
        style={{
          paddingTop: "var(--stack-md)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <h2>
          Outreach CRM <span style={{ color: "var(--hanko)" }}>· every touch, tracked</span>
        </h2>
        <button
          type="button"
          className="mono"
          onClick={refreshEngagement}
          disabled={refreshing}
          style={{
            border: "1px solid var(--ink)",
            background: "transparent",
            padding: "0.35rem 0.8rem",
            cursor: refreshing ? "wait" : "pointer",
          }}
        >
          {refreshing ? "checking X…" : "↻ refresh engagement"}
        </button>
      </div>
      <hr className="crease" />

      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          flexWrap: "wrap",
          marginBottom: "var(--stack-md)",
        }}
      >
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className="mono"
            onClick={() => setFilter(s)}
            style={{
              border: "1px solid var(--ink)",
              background: filter === s ? "var(--kraft)" : "transparent",
              padding: "0.3rem 0.7rem",
              cursor: "pointer",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack-sm)" }}>
        {rows.map((r) => (
          <div className="kraft-card" key={r.id} style={{ padding: "0.9rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.5rem",
                cursor: "pointer",
              }}
              onClick={() => setExpanded(expanded === r.id ? null : r.id)}
            >
              <div>
                <strong>{r.contacts?.name ?? r.contacts?.handle ?? "unknown contact"}</strong>{" "}
                <span className="mono" style={{ color: "var(--ink-soft)" }}>
                  {r.contacts?.company ? `· ${r.contacts.company}` : ""}
                  {r.agent_sessions?.domain ? ` · via ${r.agent_sessions.domain}` : ""}
                </span>
              </div>
              <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                <span className="mono">{r.surface}</span>
                <span
                  className="mono"
                  style={{ color: STATUS_COLOR[r.status] ?? "var(--ink)", fontWeight: 700 }}
                >
                  {r.status.toUpperCase()}
                </span>
              </div>
            </div>
            {expanded === r.id && (
              <div style={{ marginTop: "var(--stack-sm)" }}>
                <hr className="crease" />
                {r.draft && (
                  <pre
                    className="mono"
                    style={{
                      whiteSpace: "pre-wrap",
                      background: "var(--paper)",
                      padding: "0.75rem",
                      border: "1px solid var(--crease)",
                    }}
                  >
                    {r.draft}
                  </pre>
                )}
                {Array.isArray(r.receipt?.replies) && r.receipt.replies.length > 0 && (
                  <div style={{ marginTop: "var(--stack-sm)" }}>
                    <p className="label-caps" style={{ color: "var(--moss)" }}>
                      Replies ({r.receipt.replies.length})
                    </p>
                    {(
                      r.receipt.replies as {
                        author?: string;
                        from?: string;
                        text?: string;
                        preview?: string;
                        at: string;
                      }[]
                    ).map((reply, i) => (
                      <div
                        key={i}
                        style={{
                          borderLeft: "3px solid var(--moss)",
                          paddingLeft: "0.75rem",
                          marginTop: "0.4rem",
                        }}
                      >
                        <span className="mono" style={{ fontWeight: 700 }}>
                          {reply.author ?? reply.from}
                        </span>{" "}
                        <span style={{ fontSize: 14 }}>{reply.text ?? reply.preview}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mono" style={{ color: "var(--ink-soft)", marginTop: "0.4rem" }}>
                  receipt: {r.receipt ? JSON.stringify(r.receipt).slice(0, 200) : "—"} · logged{" "}
                  {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        ))}
        {rows.length === 0 && (
          <p className="mono" style={{ color: "var(--outline)" }}>
            no outreach logged yet — approve an opportunity on the dashboard to see it here
          </p>
        )}
      </div>

      <section style={{ marginTop: "var(--stack-lg)" }}>
        <h3>Do-not-contact list</h3>
        <div
          style={{ marginTop: "var(--stack-sm)", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
        >
          {suppressed.map((s) => (
            <span
              key={s.id}
              className="mono"
              style={{
                border: "1px solid var(--ink)",
                padding: "0.25rem 0.6rem",
                background: "var(--kraft-light)",
              }}
            >
              ✗ {s.handle}
            </span>
          ))}
          {suppressed.length === 0 && (
            <p className="mono" style={{ color: "var(--outline)" }}>
              empty
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
