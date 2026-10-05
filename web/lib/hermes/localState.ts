import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { env } from "@/lib/config/env";

/**
 * Read-only access to the local Hermes state (SQLite) for the Activity view.
 * Only available when Kami runs on the same machine as Hermes; callers get
 * `available: false` otherwise.
 */

/** Hermes home: HERMES_HOME, else %LOCALAPPDATA%\hermes on Windows, else ~/.hermes. */
export function hermesHome(): string {
  const configured = env().HERMES_HOME;
  if (configured) return configured;
  if (process.platform === "win32" && process.env.LOCALAPPDATA)
    return join(process.env.LOCALAPPDATA, "hermes");
  return join(homedir(), ".hermes");
}

export interface HermesRun {
  id: string;
  source: string;
  started_at: number;
  ended_at: number | null;
  message_count: number;
  tool_call_count: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  model: string | null;
}

export interface HermesKanbanTask {
  id: number;
  title: string;
  status: string;
  assignee: string | null;
  priority: string | null;
  created_at: string | null;
  completed_at: string | null;
}

function openReadonly(file: string): DatabaseSync | null {
  const path = join(hermesHome(), file);
  if (!existsSync(path)) return null;
  try {
    return new DatabaseSync(path, { readOnly: true });
  } catch {
    return null;
  }
}

export function localStateAvailable(): boolean {
  return existsSync(join(hermesHome(), "state.db"));
}

/** Hermes sessions created for one Kami campaign (ids `kami-<campaign>-…`). */
export function listRuns(campaignId: string, limit = 50): HermesRun[] {
  const db = openReadonly("state.db");
  if (!db) return [];
  try {
    return db
      .prepare(
        `select id, source, started_at, ended_at, message_count, tool_call_count,
                input_tokens, output_tokens, estimated_cost_usd, model
         from sessions
         where id like ?
         order by started_at desc limit ?`,
      )
      .all(`kami-${campaignId}-%`, limit) as unknown as HermesRun[];
  } finally {
    db.close();
  }
}

export function listKanbanTasks(): HermesKanbanTask[] {
  const db = openReadonly("kanban.db");
  if (!db) return [];
  try {
    return db
      .prepare(
        `select id, title, status, assignee, priority, created_at, completed_at
         from tasks order by created_at desc limit 100`,
      )
      .all() as unknown as HermesKanbanTask[];
  } finally {
    db.close();
  }
}
