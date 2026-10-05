"use client";

import { useCallback, useEffect, useState } from "react";
import type { SalesTask, SalesTaskStatus } from "@/lib/salesTypes";

interface SalesTaskBoardProps {
  sessionDbId: string | null;
}

export default function SalesTaskBoard({ sessionDbId }: SalesTaskBoardProps) {
  const [tasks, setTasks] = useState<SalesTask[]>([]);
  const [newTitle, setNewTitle] = useState("");

  const fetchTasks = useCallback(() => {
    if (!sessionDbId) return;
    fetch(`/api/sales/tasks?session_id=${sessionDbId}`)
      .then((r) => r.json())
      .then((j) => setTasks(j.tasks ?? []))
      .catch(() => {});
  }, [sessionDbId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  async function updateStatus(id: string, status: SalesTaskStatus) {
    await fetch("/api/sales/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    fetchTasks();
  }

  async function addTask() {
    const title = newTitle.trim();
    if (!title || !sessionDbId) return;
    await fetch("/api/sales/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionDbId, title }),
    });
    setNewTitle("");
    fetchTasks();
  }

  const open = tasks.filter((t) => t.status === "open" || t.status === "in_progress");
  const done = tasks.filter((t) => t.status === "done");

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--stack-sm)" }}>
        <div>
          <p className="label-caps" style={{ marginBottom: "0.35rem" }}>
            Open ({open.length})
          </p>
          {open.map((t) => (
            <div
              key={t.id}
              className="kraft-card"
              style={{ padding: "0.5rem 0.75rem", marginBottom: "0.35rem" }}
            >
              <p style={{ fontSize: 13, margin: 0 }}>{t.title}</p>
              <p
                className="mono"
                style={{ fontSize: 10, color: "var(--outline)", marginTop: "0.15rem" }}
              >
                {t.priority}
                {t.due_at ? ` · due ${new Date(t.due_at).toLocaleDateString()}` : ""}
              </p>
              <button
                type="button"
                className="mono"
                onClick={() => updateStatus(t.id!, "done")}
                style={{
                  marginTop: "0.25rem",
                  border: "1px solid var(--moss)",
                  color: "var(--moss)",
                  background: "transparent",
                  padding: "0.15rem 0.4rem",
                  fontSize: 10,
                  cursor: "pointer",
                }}
              >
                Mark done
              </button>
            </div>
          ))}
        </div>
        <div>
          <p className="label-caps" style={{ marginBottom: "0.35rem" }}>
            Done ({done.length})
          </p>
          {done.slice(0, 8).map((t) => (
            <p
              key={t.id}
              className="mono"
              style={{ fontSize: 12, color: "var(--ink-soft)", margin: "0.2rem 0" }}
            >
              ✓ {t.title}
            </p>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "var(--stack-sm)" }}>
        <div className="form-line" style={{ flex: 1 }}>
          <label className="mono label-caps" htmlFor="new-task">
            New task
          </label>
          <input
            id="new-task"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="Follow up with…"
          />
        </div>
        <button
          className="hanko-btn"
          onClick={addTask}
          style={{ alignSelf: "flex-end", fontSize: 12 }}
        >
          Add
        </button>
      </div>
    </div>
  );
}
