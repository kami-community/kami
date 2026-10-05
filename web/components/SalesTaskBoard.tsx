"use client";

import { useState } from "react";
import type { SalesTask, SalesTaskStatus } from "@/lib/salesTypes";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";

interface SalesTaskBoardProps {
  sessionDbId: string | null;
}

export default function SalesTaskBoard({ sessionDbId }: SalesTaskBoardProps) {
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
    const ok = await run("new", () =>
      api.post("/api/sales/tasks", { session_id: sessionDbId, title }),
    );
    if (ok) setNewTitle("");
  }

  const tasks = data?.tasks ?? [];
  const open = tasks.filter((t) => t.status === "open" || t.status === "in_progress");
  const done = tasks.filter((t) => t.status === "done");
  const shownError = actionError ?? error;

  return (
    <section className="panel-section" aria-labelledby="sales-tasks-title">
      <p id="sales-tasks-title" className="label-caps">
        Tasks
      </p>
      {shownError && (
        <p role="alert" className="form-error">
          {shownError}
        </p>
      )}
      {loading && !data && <p className="fine-print">Loading tasks…</p>}

      <div className="two-col">
        <div>
          <p className="label-caps">Open ({open.length})</p>
          <div className="card-list card-list--tight">
            {open.map((t) => (
              <div key={t.id} className="kraft-card compact-card task-card">
                <p className="task-card__title">{t.title}</p>
                <p className="fine-print">
                  {t.priority}
                  {t.due_at ? ` · due ${new Date(t.due_at).toLocaleDateString()}` : ""}
                </p>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => t.id && updateStatus(t.id, "done")}
                  disabled={busy === t.id}
                >
                  {busy === t.id ? "Saving…" : "Mark done"}
                </button>
              </div>
            ))}
          </div>
        </div>
        <div>
          <p className="label-caps">Done ({done.length})</p>
          <ul className="row-list">
            {done.slice(0, 8).map((t) => (
              <li key={t.id} className="fine-print">
                ✓ {t.title}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <form className="inline-form" onSubmit={addTask}>
        <div className="form-line">
          <label className="mono label-caps" htmlFor="new-task">
            New task
          </label>
          <input
            id="new-task"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Follow up with…"
            maxLength={300}
          />
        </div>
        <button
          type="submit"
          className="btn-secondary"
          disabled={!sessionDbId || !newTitle.trim() || busy === "new"}
        >
          {busy === "new" ? "Adding…" : "Add"}
        </button>
      </form>
    </section>
  );
}
