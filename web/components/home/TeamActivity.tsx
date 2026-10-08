"use client";

import { useEffect, useRef } from "react";
import { timeAgo } from "@/components/inbox/format";
import { useAgentActivity } from "@/components/shell/AgentActivity";
import { useWorkspace } from "@/components/shell/WorkspaceContext";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import { IconArrowRight, IconSparkle, IconWarning } from "@/components/ui/icons";
import { Section } from "@/components/ui/Page";
import Skeleton from "@/components/ui/Skeleton";
import { withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import { describeRun, type RunSummary } from "./runCopy";

const FAILED = new Set(["error", "timeout", "failed", "stale"]);

/** Home → the last few agent runs in plain language, and who is working now. */
export default function TeamActivity({ sessionId }: { sessionId: string }) {
  const { running } = useAgentActivity();
  const { navigate } = useWorkspace();
  const runs = useApi<{ runs: RunSummary[] }>(
    withQuery("/api/activity/runs", { session_id: sessionId, limit: 5 }),
  );

  // refetch when a live run starts or finishes
  const { reload } = runs;
  const last = useRef(running);
  useEffect(() => {
    if (running === last.current) return;
    last.current = running;
    reload();
  }, [running, reload]);

  const list = runs.data?.runs ?? [];
  return (
    <Section
      title="Team activity"
      desc={running ? `${running} agent${running === 1 ? "" : "s"} working now` : undefined}
      actions={
        <Button size="xs" variant="quiet" onClick={() => navigate({ area: "team", tab: "runs" })}>
          Open Team <IconArrowRight size={12} />
        </Button>
      }
    >
      {runs.error && (
        <Callout
          tone="error"
          actions={
            <Button size="sm" variant="secondary" onClick={reload}>
              Try again
            </Button>
          }
        >
          {runs.error}
        </Callout>
      )}
      {runs.loading && !runs.data && (
        <div className="card home-activity">
          <Skeleton lines={3} />
        </div>
      )}
      {runs.data && list.length === 0 && (
        <p className="home-quiet">No agent work yet. Each run shows up here as it happens.</p>
      )}
      {list.length > 0 && (
        <ul className="card home-activity">
          {list.map((run) => {
            const failed = FAILED.has(run.status);
            const live = run.status === "running";
            return (
              <li
                key={run.id}
                className={`home-activity__row${failed ? " is-failed" : ""}${live ? " is-live" : ""}`}
              >
                <span className="home-activity__icon" aria-hidden>
                  {failed ? <IconWarning size={13} /> : <IconSparkle size={13} />}
                </span>
                <span className="home-activity__text">{describeRun(run)}</span>
                <time className="home-activity__at" dateTime={run.created_at}>
                  {live ? "now" : timeAgo(run.created_at)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
