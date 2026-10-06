"use client";

import LoadingState from "@/components/bui/LoadingState";
import ThinkingState from "@/components/bui/ThinkingState";
import { useEffect } from "react";
import { useStagedProgress } from "@/components/bui/useStagedProgress";
import { useAgentActivity } from "@/components/shell/AgentActivity";
import { AGENT_PROFILES } from "@/lib/domain/agents";
import type { AgentName } from "@/lib/hermes/agents";

/** The Hermes agents behind Find customers, named the way the Team page names them. */
export type SalesAgent = Extract<
  AgentName,
  | "brand-analyst"
  | "sales-strategist"
  | "sales-researcher"
  | "outreach"
  | "sales-conversation-manager"
>;

/**
 * An inline wait for one long agent step: "Sales researcher is verifying 5
 * companies", an elapsed timer, and the staged trace of what it is doing.
 */
export default function AgentWait({
  agent,
  doing,
  stages,
  busy = true,
  detail,
  note,
  stepMs = 3000,
}: {
  agent: SalesAgent;
  /** what the agent is doing, after its name: "is drafting your segments" */
  doing: string;
  stages: readonly string[];
  busy?: boolean;
  detail?: string | null;
  /** a quiet line under the trace, e.g. how long this usually takes */
  note?: string;
  stepMs?: number;
}) {
  const staged = useStagedProgress(stages, busy, { stepMs });
  const name = AGENT_PROFILES[agent].label;
  const label = `${name} ${doing}`;
  // light up the top-bar activity indicator now, not on its next slow poll
  const { refresh } = useAgentActivity();
  useEffect(() => {
    if (!busy) return;
    const id = window.setTimeout(refresh, 600);
    return () => window.clearTimeout(id);
  }, [busy, refresh]);
  return (
    <div className="stage stage--start sales-wait">
      <div className="stack sales-wait__inner">
        <LoadingState label={label} startedAt={staged.startedAt ?? undefined} detail={detail} />
        <ThinkingState working={busy} rows={staged.rows} active={name} done="Done" />
        {note && <p className="text-3 text-xs">{note}</p>}
      </div>
    </div>
  );
}
