"use client";

import RecordsTable from "@/components/bui/RecordsTable";
import TaskRows from "@/components/bui/TaskRows";
import Callout from "@/components/ui/Callout";
import Card, { CardBody } from "@/components/ui/Card";
import { Section } from "@/components/ui/Page";
import Skeleton from "@/components/ui/Skeleton";
import { withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";

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

  if (loading && !data) return <Skeleton title lines={5} />;
  if (error) return <Callout tone="error">{error}</Callout>;
  if (!data?.available) {
    return (
      <Callout tone="info" title="Hermes’ local state isn’t readable from this server">
        Set <code>HERMES_HOME</code> if Hermes runs on this machine with a custom home, or use{" "}
        <code>hermes sessions export</code>.
      </Callout>
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

  const stats = [
    { label: "Sessions", value: fmt(data.runs.length) },
    { label: "Tokens", value: fmt(totals.tokens) },
    { label: "Tool calls", value: fmt(totals.tools) },
    { label: "Cost", value: `$${totals.cost.toFixed(2)}` },
  ];

  return (
    <>
      <div className="stat-grid">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardBody className="stat">
              <span className="stat__label">{s.label}</span>
              <span className="stat__value tabular">{s.value}</span>
            </CardBody>
          </Card>
        ))}
      </div>

      <Section num="01" title="Sessions">
        <RecordsTable
          label="Hermes sessions"
          rows={data.runs}
          rowId={(r) => r.id}
          anchor={{ label: "Session", width: 280, name: (r) => r.id, mark: () => null }}
          countLabel="sessions"
          columns={[
            {
              key: "started",
              label: "Started",
              width: 190,
              render: (r) => (r.started_at ? new Date(r.started_at).toLocaleString() : "—"),
              sort: (a, b) => (a.started_at ?? "").localeCompare(b.started_at ?? ""),
            },
            {
              key: "duration",
              label: "Duration",
              width: 110,
              render: (r) => (r.duration_s != null ? `${r.duration_s}s` : "—"),
              sort: (a, b) => (a.duration_s ?? 0) - (b.duration_s ?? 0),
            },
            {
              key: "tools",
              label: "Tool calls",
              width: 110,
              render: (r) => fmt(r.tool_calls),
              sort: (a, b) => a.tool_calls - b.tool_calls,
              footer: () => fmt(totals.tools),
            },
            {
              key: "tokens",
              label: "Tokens in / out",
              width: 170,
              render: (r) => `${fmt(r.input_tokens)} / ${fmt(r.output_tokens)}`,
            },
            { key: "model", label: "Model", width: 160, render: (r) => r.model ?? "—" },
          ]}
        />
      </Section>

      {data.tasks.length > 0 && (
        <Section num="02" title="Hermes kanban">
          <TaskRows
            variant="List"
            rows={data.tasks.map((t, i) => ({
              key: String(t.id),
              label: t.title,
              amount: [t.assignee, t.priority].filter(Boolean).join(" · ") || undefined,
              status:
                t.status === "done"
                  ? "done"
                  : t.status === "failed"
                    ? "failed"
                    : t.status === "in_progress"
                      ? "running"
                      : "pending",
              step: i + 1,
            }))}
          />
        </Section>
      )}
    </>
  );
}
