"use client";

import { useMemo, useState } from "react";
import CodeBlock from "@/components/bui/CodeBlock";
import ToolChips, { type ToolIcon, type ToolStep } from "@/components/bui/ToolChips";
import { useAgentActivity } from "@/components/shell/AgentActivity";
import { duration, elapsed, runStatusLabel, useNow } from "@/components/team/format";
import { useActivityPulse } from "@/components/team/useActivityPulse";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Field";
import { IconRefresh, IconSparkle } from "@/components/ui/icons";
import { Monogram } from "@/components/ui/Pills";
import Segmented from "@/components/ui/Segmented";
import Skeleton from "@/components/ui/Skeleton";
import { withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import { AGENT_LABELS, isFailedStatus } from "@/lib/activity/labels";
import type { RunDetail } from "@/lib/activity/runs";

function iconFor(run: RunDetail): ToolIcon {
  if (run.source === "hermes_stream" || run.agent === "guide") return "think";
  if (/draft|write|revise|rewrite/.test(run.kind)) return "write";
  if (/research|discover|find|read|rank/.test(run.kind)) return "read";
  return "run";
}

function lines(text: string | null, max: number): string[] {
  if (!text) return [];
  const all = text.split("\n").filter((l) => l.trim());
  return all.length > max ? [...all.slice(0, max), `… ${all.length - max} more lines`] : all;
}

/** Pretty-print JSON outputs; leave prose alone. */
function formatted(text: string): string[] {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? text).trim();
  try {
    return JSON.stringify(JSON.parse(raw), null, 2).split("\n");
  } catch {
    return text.split("\n");
  }
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

type Filter = "all" | "failed";

/**
 * Team → Runs: what is running now (live), then every agent run for this
 * campaign grouped by day, with input and output one click away.
 */
export default function AgentRuns({
  sessionId,
  agent = null,
  onAgentChange,
}: {
  sessionId: string;
  /** show only this agent's runs */
  agent?: string | null;
  onAgentChange?: (agent: string | null) => void;
}) {
  const { data, error, loading, reload } = useApi<{ runs: RunDetail[] }>(
    withQuery("/api/activity/runs", { session_id: sessionId, limit: 100, agent }),
  );
  const activity = useAgentActivity();
  useActivityPulse(reload);
  const now = useNow(activity.running > 0) + activity.skewMs;

  const [filter, setFilter] = useState<Filter>("all");
  const [inspect, setInspect] = useState<string | null>(null);
  const runs = useMemo(() => (data?.runs ?? []).filter((r) => r.status !== "running"), [data]);
  const live = activity.runs.filter((r) => !agent || r.agent === agent);
  const failed = runs.filter((r) => isFailedStatus(r.status));
  const shown = filter === "failed" ? failed : runs;

  const days = useMemo(() => {
    const map = new Map<string, RunDetail[]>();
    for (const r of shown)
      map.set(dayLabel(r.started_at), [...(map.get(dayLabel(r.started_at)) ?? []), r]);
    return [...map.entries()];
  }, [shown]);

  const inspected = runs.find((r) => r.id === inspect) ?? null;
  const agentOptions = Object.entries(AGENT_LABELS);
  if (agent && !AGENT_LABELS[agent]) agentOptions.push([agent, { label: agent, role: "" }]);

  return (
    <div className="stack">
      <div className="queue-bar">
        <div className="row">
          <Select
            aria-label="Filter runs by agent"
            className="runs-agent-filter"
            value={agent ?? ""}
            onChange={(e) => onAgentChange?.(e.target.value || null)}
            disabled={!onAgentChange}
          >
            <option value="">All agents</option>
            {agentOptions.map(([name, l]) => (
              <option key={name} value={name}>
                {l.label}
              </option>
            ))}
          </Select>
          <Segmented<Filter>
            label="Filter runs"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All runs", count: runs.length },
              { value: "failed", label: "Failed", count: failed.length },
            ]}
          />
        </div>
        <Button
          size="xs"
          variant="secondary"
          icon={<IconRefresh size={12} />}
          onClick={reload}
          busy={loading && Boolean(data)}
        >
          Refresh
        </Button>
      </div>

      {live.length > 0 && (
        <Card className="runs-live" aria-live="polite">
          <p className="runs-live__caption">
            <span className="agent-activity__dot" aria-hidden />
            Working now
          </p>
          <ul className="runs-live__list">
            {live.map((run) => (
              <li key={run.id} className="runs-live__row">
                <Monogram name={run.agent_label} shape="square" />
                <span className="runs-live__agent">{run.agent_label}</span>
                <span className="runs-live__task">{run.task}</span>
                <span className="runs-live__timer mono tabular">
                  {elapsed(now - Date.parse(run.started_at))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {error && <Callout tone="error">{error}</Callout>}
      {loading && !data && <Skeleton title lines={6} />}
      {data && runs.length === 0 && live.length === 0 && (
        <EmptyState
          title={
            agent ? `No runs by ${AGENT_LABELS[agent]?.label ?? agent} yet` : "No agent runs yet"
          }
          icon={<IconSparkle size={14} />}
        >
          Every agent step Kami runs for this campaign is logged here with its input and output.
        </EmptyState>
      )}
      {data && runs.length > 0 && shown.length === 0 && (
        <EmptyState title="No failed runs" icon={<IconSparkle size={14} />}>
          Every finished run in this view succeeded.
        </EmptyState>
      )}

      {days.map(([day, list]) => {
        const steps: ToolStep[] = list.map((run) => ({
          key: run.id,
          icon: iconFor(run),
          label: `${run.agent_label}${run.duration_ms != null ? ` · ${duration(run.duration_ms)}` : ""}`,
          chip: run.task,
          failed: isFailedStatus(run.status),
          detailMono: true,
          detail: [
            {
              text: `${new Date(run.started_at).toLocaleTimeString()} · ${runStatusLabel(run.status)} · ${run.kind}${run.hermes_session_id ? ` · ${run.hermes_session_id}` : ""}`,
              tone: "muted" as const,
            },
            ...(run.error ? [{ text: run.error, tone: "del" as const }] : []),
            ...lines(run.output_text, 6).map((text) => ({ text, tone: "add" as const })),
          ],
        }));
        const fails = list.filter((r) => isFailedStatus(r.status)).length;
        return (
          <div key={day} className="card runs-day">
            <ToolChips
              header={`${day} · ${list.length} agent run${list.length === 1 ? "" : "s"}${fails ? `, ${fails} failed` : ""}`}
              steps={steps}
              artifacts={list
                .filter((r) => r.output_text)
                .slice(0, 4)
                .map((r) => ({
                  key: r.id,
                  label: `${r.kind}.out`,
                  add: lines(r.output_text, 999).length,
                  lines: lines(r.output_text, 8).map((text) => ({ text, tone: "add" as const })),
                }))}
              more={
                list.some((r) => r.output_text)
                  ? {
                      label: "Inspect latest output",
                      onClick: () => setInspect(list.find((r) => r.output_text)?.id ?? null),
                    }
                  : undefined
              }
            />
          </div>
        );
      })}

      {inspected?.output_text && (
        <div className="fade-up stack stack--sm">
          <div className="row row--between">
            <span className="text-2 text-sm">
              {inspected.agent_label} · {inspected.task}
            </span>
            <Button size="xs" variant="quiet" onClick={() => setInspect(null)}>
              Close
            </Button>
          </div>
          {inspected.input_preview && (
            <CodeBlock
              filename="input.txt"
              lines={inspected.input_preview.split("\n")}
              maxHeight={220}
            />
          )}
          <CodeBlock
            filename={`${inspected.kind}.json`}
            lines={formatted(inspected.output_text)}
            maxHeight={420}
          />
        </div>
      )}
    </div>
  );
}
