"use client";

import { useEffect, useState } from "react";

interface Run {
  id: string;
  source: string;
  started_at: string | null;
  duration_s: number | null;
  messages: number;
  tool_calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  model: string | null;
}

interface Totals {
  runs: number;
  input_tokens: number;
  output_tokens: number;
  tool_calls: number;
}

interface AgentRunLog {
  id: string;
  session_id: string | null;
  source: string;
  kind: string;
  agent: string | null;
  status: string;
  model: string | null;
  input_preview: string | null;
  output_text: string | null;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

export default function LedgerPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agentRuns, setAgentRuns] = useState<AgentRunLog[]>([]);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/observability")
      .then((r) => r.json())
      .then((json) => {
        setRuns(json.runs ?? []);
        setTotals(json.totals ?? null);
      })
      .catch(() => setError("Hermes local state.db unavailable on this machine"));

    fetch("/api/observability/runs?limit=80")
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) {
          setAgentError(json.error ?? "Could not load agent_run_logs");
          return;
        }
        setAgentRuns(json.runs ?? []);
      })
      .catch(() => setAgentError("Could not load Supabase agent_run_logs"));
  }, []);

  const maxTokens = Math.max(1, ...runs.map((r) => r.input_tokens + r.output_tokens));

  return (
    <main className="container-wide" style={{ paddingBottom: "var(--stack-lg)" }}>
      <div style={{ paddingTop: "var(--stack-md)" }}>
        <h2>
          Run Ledger <span style={{ color: "var(--hanko)" }}>· every agent run, accounted</span>
        </h2>
        <p className="mono" style={{ color: "var(--ink-soft)", marginTop: "0.25rem" }}>
          Supabase agent_run_logs (product) · Hermes state.db (local tokens)
        </p>
      </div>
      <hr className="crease" />

      <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
        Kami outputs (Supabase)
      </p>
      {agentError && (
        <p className="mono" style={{ color: "var(--hanko)", marginBottom: "var(--stack-sm)" }}>
          {agentError}
        </p>
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--stack-sm)",
          marginBottom: "var(--stack-lg)",
        }}
      >
        {agentRuns.map((r) => (
          <div className="kraft-card" key={r.id} style={{ padding: "0.9rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <span className="mono" style={{ fontWeight: 700 }}>
                {r.kind}
                {r.agent ? ` · ${r.agent}` : ""} · {r.status}
              </span>
              <span className="mono" style={{ color: "var(--ink-soft)" }}>
                {new Date(r.created_at).toLocaleString()}
                {r.duration_ms != null ? ` · ${Math.round(r.duration_ms / 1000)}s` : ""}
              </span>
            </div>
            <p
              className="mono"
              style={{ color: "var(--ink-soft)", marginTop: "0.35rem", fontSize: 12 }}
            >
              {r.source}
              {r.model ? ` · ${r.model}` : ""}
              {r.session_id ? ` · session ${r.session_id.slice(0, 8)}` : ""}
            </p>
            {r.error && (
              <p
                className="mono"
                style={{ color: "var(--hanko)", marginTop: "0.35rem", fontSize: 12 }}
              >
                {r.error}
              </p>
            )}
            <button
              type="button"
              className="mono"
              onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              style={{
                marginTop: "0.5rem",
                border: "1px solid var(--ink)",
                background: "transparent",
                padding: "0.25rem 0.6rem",
                cursor: "pointer",
              }}
            >
              {expanded === r.id ? "Hide output" : "Show output"}
            </button>
            {expanded === r.id && (
              <pre
                className="mono"
                style={{
                  marginTop: "0.5rem",
                  whiteSpace: "pre-wrap",
                  fontSize: 12,
                  maxHeight: 320,
                  overflow: "auto",
                  background: "var(--paper)",
                  padding: "0.75rem",
                  border: "1px solid var(--crease)",
                }}
              >
                {r.output_text || r.input_preview || "(empty)"}
              </pre>
            )}
          </div>
        ))}
        {!agentError && agentRuns.length === 0 && (
          <p className="mono" style={{ color: "var(--outline)" }}>
            no agent_run_logs yet — run a campaign after applying migration 010
          </p>
        )}
      </div>

      <hr className="crease" />
      <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
        Hermes local token ledger
      </p>

      {totals && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "var(--stack-md)",
            marginBottom: "var(--stack-md)",
          }}
        >
          {[
            ["Runs", fmt(totals.runs)],
            ["Input tokens", fmt(totals.input_tokens)],
            ["Output tokens", fmt(totals.output_tokens)],
            ["Tool calls", fmt(totals.tool_calls)],
          ].map(([label, value]) => (
            <div
              className="kraft-card"
              key={label}
              style={{ padding: "1rem", textAlign: "center" }}
            >
              <p className="label-caps">{label}</p>
              <p style={{ fontFamily: "var(--font-headline)", fontSize: 28, fontWeight: 700 }}>
                {value}
              </p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="mono" style={{ color: "var(--ink-soft)" }}>
          {error}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack-sm)" }}>
        {runs.map((r) => (
          <div className="kraft-card" key={r.id} style={{ padding: "0.9rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <span className="mono" style={{ fontWeight: 700 }}>
                {r.id}
              </span>
              <span className="mono" style={{ color: "var(--ink-soft)" }}>
                {r.started_at ? new Date(r.started_at).toLocaleString() : "—"}
                {r.duration_s != null ? ` · ${r.duration_s}s` : ""}
              </span>
            </div>
            <div
              style={{
                marginTop: "0.5rem",
                height: 8,
                background: "var(--paper)",
                border: "1px solid var(--crease)",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${((r.input_tokens + r.output_tokens) / maxTokens) * 100}%`,
                  background: "var(--hanko)",
                }}
              />
            </div>
            <p className="mono" style={{ color: "var(--ink-soft)", marginTop: "0.4rem" }}>
              in {fmt(r.input_tokens)} · out {fmt(r.output_tokens)} · {r.messages} msgs ·{" "}
              {r.tool_calls} tool calls
              {r.model ? ` · ${r.model}` : ""}
            </p>
          </div>
        ))}
        {!error && runs.length === 0 && (
          <p className="mono" style={{ color: "var(--outline)" }}>
            no local Hermes runs yet
          </p>
        )}
      </div>
    </main>
  );
}
