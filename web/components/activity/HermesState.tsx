"use client";

import { withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import Skeleton from "@/components/ui/Skeleton";

interface HermesRun {
  id: string;
  started_at: string | null;
  duration_s: number | null;
  messages: number;
  tool_calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  model: string | null;
}

interface HermesTask {
  id: number;
  title: string;
  status: string;
  assignee: string | null;
  priority: string | null;
}

interface HermesStateResponse {
  available: boolean;
  runs: HermesRun[];
  tasks: HermesTask[];
}

const fmt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());

/** Hermes' own session ledger and kanban board (when Hermes runs on this machine). */
export default function HermesState({ sessionId }: { sessionId: string }) {
  const { data, error, loading } = useApi<HermesStateResponse>(
    withQuery("/api/activity/hermes", { session_id: sessionId }),
  );

  if (loading) return <Skeleton lines={4} />;
  if (error)
    return (
      <p role="alert" className="mono form-error">
        {error}
      </p>
    );
  if (!data?.available) {
    return (
      <p className="muted">
        Hermes&apos; local state isn&apos;t readable from this server. Set <code>HERMES_HOME</code>{" "}
        if Hermes runs on this machine with a custom home, or use{" "}
        <code>hermes sessions export</code>.
      </p>
    );
  }

  const totals = data.runs.reduce(
    (acc, r) => ({
      tokens: acc.tokens + (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
      tools: acc.tools + (r.tool_calls ?? 0),
      cost: acc.cost + (r.cost_usd ?? 0),
    }),
    { tokens: 0, tools: 0, cost: 0 },
  );

  return (
    <section>
      <p className="label-caps">Hermes sessions for this campaign</p>
      <p className="mono meta-line">
        {data.runs.length} sessions · {fmt(totals.tokens)} tokens · {fmt(totals.tools)} tool calls ·
        ${totals.cost.toFixed(2)}
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Session</th>
            <th scope="col">Started</th>
            <th scope="col">Duration</th>
            <th scope="col">Tool calls</th>
            <th scope="col">Tokens in / out</th>
          </tr>
        </thead>
        <tbody>
          {data.runs.map((r) => (
            <tr key={r.id}>
              <td className="mono">{r.id}</td>
              <td>{r.started_at ? new Date(r.started_at).toLocaleString() : "—"}</td>
              <td>{r.duration_s != null ? `${r.duration_s}s` : "—"}</td>
              <td>{fmt(r.tool_calls)}</td>
              <td>
                {fmt(r.input_tokens)} / {fmt(r.output_tokens)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {data.tasks.length > 0 && (
        <>
          <p className="label-caps" style={{ marginTop: "var(--stack-md)" }}>
            Hermes kanban
          </p>
          <ul className="row-list">
            {data.tasks.map((t) => (
              <li key={t.id} className="row row--flat">
                <span className={`status-pill status-pill--${t.status}`}>{t.status}</span>
                <span className="row__title">{t.title}</span>
                <span className="mono muted">
                  {[t.assignee, t.priority].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
