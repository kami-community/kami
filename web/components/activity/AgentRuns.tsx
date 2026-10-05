"use client";

import { useState } from "react";
import { withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import EmptyState from "@/components/ui/EmptyState";
import Skeleton from "@/components/ui/Skeleton";

interface AgentRun {
  id: string;
  kind: string;
  agent: string | null;
  status: string;
  source: string;
  hermes_session_id: string | null;
  input_preview: string | null;
  output_text: string | null;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

/** The trace of every agent run for this campaign (what went in, what came out). */
export default function AgentRuns({ sessionId }: { sessionId: string }) {
  const { data, error, loading, reload } = useApi<{ runs: AgentRun[] }>(
    withQuery("/api/activity/runs", { session_id: sessionId, limit: 100 }),
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const runs = data?.runs ?? [];

  return (
    <section>
      <div className="section-head">
        <p className="label-caps">Agent runs</p>
        <button type="button" className="mono btn-outline" onClick={reload}>
          ↻ Refresh
        </button>
      </div>
      {loading && <Skeleton lines={4} />}
      {error && (
        <p role="alert" className="mono form-error">
          {error}
        </p>
      )}
      {!loading && !error && runs.length === 0 && (
        <EmptyState title="No agent runs yet">
          Every agent step Kami runs for this campaign is logged here with its input and output.
        </EmptyState>
      )}
      <ul className="row-list fade-in">
        {runs.map((run) => (
          <li key={run.id} className="row">
            <button
              type="button"
              className="row__summary"
              aria-expanded={expanded === run.id}
              onClick={() => setExpanded((id) => (id === run.id ? null : run.id))}
            >
              <span className={`status-pill status-pill--${run.status}`}>{run.status}</span>
              <span className="mono">{run.agent ?? run.source}</span>
              <span className="row__title">{run.kind.replace(/_/g, " ")}</span>
              <span className="mono muted">
                {run.duration_ms != null ? `${(run.duration_ms / 1000).toFixed(1)}s · ` : ""}
                {new Date(run.created_at).toLocaleString()}
              </span>
            </button>
            {expanded === run.id && (
              <div className="row__detail">
                {run.hermes_session_id && (
                  <p className="mono meta-line">Hermes session {run.hermes_session_id}</p>
                )}
                {run.error && <p className="mono form-error">{run.error}</p>}
                {run.input_preview && (
                  <>
                    <p className="label-caps">Input</p>
                    <pre className="mono">{run.input_preview}</pre>
                  </>
                )}
                {run.output_text && (
                  <>
                    <p className="label-caps">Output</p>
                    <pre className="mono">{run.output_text}</pre>
                  </>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
