"use client";

import { useState } from "react";
import FilterTable, { FilterStatus } from "@/components/bui/FilterTable";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card, { CardBody } from "@/components/ui/Card";
import { Input } from "@/components/ui/Field";
import { IconCheck, IconPlus } from "@/components/ui/icons";
import { humanize } from "@/components/ui/Pills";
import Skeleton from "@/components/ui/Skeleton";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type { SalesTask, SalesTaskStatus } from "@/lib/salesTypes";

const STATUS_TONE: Record<string, "todo" | "progress" | "done" | "neutral"> = {
  open: "todo",
  in_progress: "progress",
  done: "done",
};

/** Follow-ups as a filterable table; add one, move it along, mark it done. */
export default function SalesTaskBoard({
  sessionDbId,
  focusId,
  onChanged,
}: {
  sessionDbId: string | null;
  /** When set (Inbox), show this task’s actions instead of the whole board. */
  focusId?: string;
  onChanged?: () => void;
}) {
  const { data, error, loading, reload } = useApi<{ tasks: SalesTask[] }>(
    sessionDbId ? withQuery("/api/sales/tasks", { session_id: sessionDbId }) : null,
  );
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setActionError(null);
    try {
      await action();
      reload();
      onChanged?.();
      return true;
    } catch (err) {
      setActionError(errorMessage(err, "Could not save the task"));
      return false;
    } finally {
      setBusy(null);
    }
  }

  function updateStatus(id: string, status: SalesTaskStatus) {
    if (!sessionDbId) return;
    void run(id, () => api.patch("/api/sales/tasks", { session_id: sessionDbId, id, status }));
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || !sessionDbId) return;
    if (await run("new", () => api.post("/api/sales/tasks", { session_id: sessionDbId, title })))
      setNewTitle("");
  }

  const tasks = (data?.tasks ?? []).filter((t) => !focusId || t.id === focusId);
  const shownError = actionError ?? error;
  const focused = focusId ? tasks[0] : undefined;

  if (focusId && loading && !data) return <Skeleton lines={2} />;

  if (focusId && data) {
    return (
      <div className="stack">
        {shownError && <Callout tone="error">{shownError}</Callout>}
        {!focused?.id ? (
          <p className="text-3 text-sm">This task is already done and has left your inbox.</p>
        ) : (
          <Card>
            <CardBody className="row row--between">
              <FilterStatus tone={STATUS_TONE[focused.status] ?? "neutral"}>
                {humanize(focused.status)}
              </FilterStatus>
              {focused.status !== "done" && (
                <span className="row" style={{ gap: 4 }}>
                  {focused.status === "open" && (
                    <Button
                      size="xs"
                      variant="quiet"
                      disabled={busy === focused.id}
                      onClick={() => updateStatus(focused.id!, "in_progress")}
                    >
                      Start
                    </Button>
                  )}
                  <Button
                    size="xs"
                    variant="secondary"
                    icon={<IconCheck size={12} />}
                    busy={busy === focused.id}
                    onClick={() => updateStatus(focused.id!, "done")}
                  >
                    Done
                  </Button>
                </span>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="stack">
      {shownError && <Callout tone="error">{shownError}</Callout>}
      {loading && !data ? (
        <Skeleton title lines={5} />
      ) : (
        <FilterTable
          label="Tasks"
          rows={tasks}
          rowKey={(t) => t.id ?? t.title}
          rowFilter={(t) => t.status}
          filters={[
            { key: "open", label: "To do", dot: "#f09a2f" },
            { key: "in_progress", label: "In progress", dot: "#16a6c7" },
            { key: "done", label: "Done", dot: "#25a878" },
          ]}
          minWidth={560}
          empty="No tasks yet — add one below."
          columns={[
            {
              key: "task",
              label: "Task",
              width: "minmax(0,1.6fr)",
              render: (t) => <span className="truncate">{t.title}</span>,
            },
            {
              key: "priority",
              label: "Priority",
              width: "minmax(0,0.6fr)",
              muted: true,
              render: (t) => humanize(t.priority),
            },
            {
              key: "due",
              label: "Due",
              width: "minmax(0,0.6fr)",
              muted: true,
              render: (t) =>
                t.due_at
                  ? new Date(t.due_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "2-digit",
                    })
                  : "—",
            },
            {
              key: "status",
              label: "Status",
              width: "minmax(0,0.8fr)",
              render: (t) => (
                <FilterStatus tone={STATUS_TONE[t.status] ?? "neutral"}>
                  {humanize(t.status)}
                </FilterStatus>
              ),
            },
            {
              key: "action",
              label: "",
              width: "minmax(0,0.8fr)",
              render: (t) =>
                t.status === "done" || !t.id ? null : (
                  <span className="row" style={{ gap: 4 }}>
                    {t.status === "open" && (
                      <Button
                        size="xs"
                        variant="quiet"
                        disabled={busy === t.id}
                        onClick={() => updateStatus(t.id!, "in_progress")}
                      >
                        Start
                      </Button>
                    )}
                    <Button
                      size="xs"
                      variant="secondary"
                      icon={<IconCheck size={12} />}
                      busy={busy === t.id}
                      onClick={() => updateStatus(t.id!, "done")}
                    >
                      Done
                    </Button>
                  </span>
                ),
            },
          ]}
        />
      )}

      <form className="inline-add" onSubmit={addTask}>
        <Input
          aria-label="New task"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Follow up with…"
          maxLength={300}
        />
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          icon={<IconPlus size={13} />}
          busy={busy === "new"}
          disabled={!sessionDbId || !newTitle.trim()}
        >
          Add task
        </Button>
      </form>
    </div>
  );
}
