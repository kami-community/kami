"use client";

import { useMemo } from "react";
import { useAgentActivity } from "@/components/shell/AgentActivity";
import Callout from "@/components/ui/Callout";
import { Monogram, Tag } from "@/components/ui/Pills";
import Skeleton from "@/components/ui/Skeleton";
import { withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type { AgentCard, AgentRoster } from "@/lib/activity/agents";
import type { RunSummary } from "@/lib/activity/runs";
import { elapsed, timeAgo, useNow } from "./format";
import { useActivityPulse } from "./useActivityPulse";

/** Team → Agents: one card per Hermes agent, live while it works. */
export default function AgentGrid({
  sessionId,
  onOpenAgent,
}: {
  sessionId: string;
  /** open this agent's runs */
  onOpenAgent: (agent: string) => void;
}) {
  const { data, error, loading, reload } = useApi<AgentRoster>(
    withQuery("/api/activity/agents", { session_id: sessionId }),
  );
  const activity = useAgentActivity();
  const now = useNow(activity.running > 0) + activity.skewMs;

  useActivityPulse(reload);

  const liveByAgent = useMemo(() => {
    const map = new Map<string, RunSummary[]>();
    for (const run of activity.runs)
      if (run.agent) map.set(run.agent, [...(map.get(run.agent) ?? []), run]);
    return map;
  }, [activity.runs]);

  if (loading && !data) return <Skeleton title lines={6} />;
  if (error && !data) return <Callout tone="error">{error}</Callout>;
  if (!data) return null;

  const agents = data.agents.filter((a) => a.registered || a.runs > 0);
  const total = agents.reduce((n, a) => n + a.runs, 0);
  const active = agents.filter((a) => a.runs > 0).length;

  return (
    <div className="stack">
      {error && <Callout tone="error">{error}</Callout>}
      <p className="team-summary text-2 text-sm">
        {total === 0
          ? "No agent has worked on this campaign yet. They start when you build the dossier, a plan or drafts."
          : `${active} of ${agents.length} agents have worked on this campaign · ${total} run${total === 1 ? "" : "s"}`}
      </p>
      <ul className="agent-grid">
        {agents.map((agent) => (
          <li key={agent.name}>
            <AgentCardView
              agent={agent}
              live={liveByAgent.get(agent.name) ?? []}
              now={now}
              onOpen={() => onOpenAgent(agent.name)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function AgentCardView({
  agent,
  live,
  now,
  onOpen,
}: {
  agent: AgentCard;
  live: RunSummary[];
  now: number;
  onOpen: () => void;
}) {
  const working = live.length > 0;
  const since = working ? Math.min(...live.map((r) => Date.parse(r.started_at))) : null;
  const rate = agent.success_rate == null ? "—" : `${Math.round(agent.success_rate * 100)}%`;

  return (
    <button
      type="button"
      className={`card card--interactive agent-card${working ? " is-working" : ""}`}
      onClick={onOpen}
      aria-label={`${agent.label}: ${working ? "working now" : `${agent.runs} runs`}. Open its runs`}
    >
      <span className="agent-card__head">
        <Monogram name={agent.label} shape="square" size="lg" />
        <span className="agent-card__title">
          <span className="agent-card__name">{agent.label}</span>
          <span className="agent-card__id mono">{agent.name}</span>
        </span>
        {working && since != null && (
          <span className="agent-card__live" role="status">
            <span className="agent-activity__dot" aria-hidden />
            Working now · <span className="tabular">{elapsed(now - since)}</span>
          </span>
        )}
      </span>

      <span className="agent-card__role">{agent.role}</span>

      {agent.skills.length > 0 && (
        <span className="tag-list agent-card__skills" aria-label="Skills">
          {agent.skills.map((skill) => (
            <Tag key={skill}>{skill.replace(/_/g, " ")}</Tag>
          ))}
        </span>
      )}

      <span className="agent-card__stats">
        <span className="agent-card__stat">
          <span className="agent-card__value tabular">{agent.runs}</span>
          <span className="agent-card__label">runs</span>
        </span>
        <span className="agent-card__stat">
          <span className={`agent-card__value tabular${agent.failed > 0 ? " is-warn" : ""}`}>
            {rate}
          </span>
          <span className="agent-card__label">success</span>
        </span>
        <span className="agent-card__stat agent-card__stat--wide">
          <span className="agent-card__value">
            {working
              ? live[0].task
              : agent.last_run_at
                ? timeAgo(agent.last_run_at, now)
                : "Not yet"}
          </span>
          <span className="agent-card__label">
            {working ? "current task" : agent.last_task ? `last · ${agent.last_task}` : "last run"}
          </span>
        </span>
      </span>
    </button>
  );
}
