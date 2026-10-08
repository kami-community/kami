"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useWorkspace } from "@/components/shell/WorkspaceContext";
import { duration, elapsed, runStatusLabel, timeAgo, useNow } from "@/components/team/format";
import Button from "@/components/ui/Button";
import { IconArrowRight, IconUsers } from "@/components/ui/icons";
import { Monogram, StatusPill, statusTone } from "@/components/ui/Pills";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import type { LiveRuns, RunSummary } from "@/lib/activity/runs";

/**
 * Live agent activity for the workspace: which Hermes agents are running now.
 * The provider polls `GET /api/activity/live` — every 3s while something runs,
 * every 20s otherwise, and not at all while the tab is hidden. The top-bar
 * indicator shows "2 agents working" with a popover of live and recent runs.
 */

const FAST_MS = 3_000;
const SLOW_MS = 20_000;

export interface AgentActivityValue {
  /** agents running right now */
  running: number;
  /** the runs in flight, newest first */
  runs: RunSummary[];
  /** the latest finished (or stale) runs */
  recent: RunSummary[];
  /** server clock minus browser clock, for live timers */
  skewMs: number;
  /** true once the first poll answered */
  loaded: boolean;
  error: string | null;
  /** poll now (e.g. right after starting an agent step) */
  refresh: () => void;
}

const AgentActivityContext = createContext<AgentActivityValue>({
  running: 0,
  runs: [],
  recent: [],
  skewMs: 0,
  loaded: false,
  error: null,
  refresh: () => {},
});

export function AgentActivityProvider({
  sessionId,
  children,
}: {
  sessionId: string;
  children: ReactNode;
}) {
  const [live, setLive] = useState<LiveRuns | null>(null);
  const [skewMs, setSkewMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pollNow = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let inFlight = false;
    let delay = SLOW_MS;
    const url = withQuery("/api/activity/live", { session_id: sessionId });

    const schedule = () => {
      window.clearTimeout(timer);
      if (!cancelled && !document.hidden) timer = window.setTimeout(poll, delay);
    };

    async function poll() {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const data = await api.get<LiveRuns>(url);
        if (cancelled) return;
        setLive(data);
        setSkewMs(Date.parse(data.now) - Date.now());
        setError(null);
        delay = data.running.length > 0 ? FAST_MS : SLOW_MS;
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, "Could not load agent activity"));
        delay = SLOW_MS;
      } finally {
        inFlight = false;
        schedule();
      }
    }

    const onVisibility = () => {
      if (document.hidden) window.clearTimeout(timer);
      else void poll();
    };

    pollNow.current = () => void poll();
    void poll();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [sessionId]);

  const refresh = useCallback(() => pollNow.current(), []);

  const value = useMemo<AgentActivityValue>(
    () => ({
      running: live?.running.length ?? 0,
      runs: live?.running ?? [],
      recent: live?.recent ?? [],
      skewMs,
      loaded: live !== null,
      error,
      refresh,
    }),
    [live, skewMs, error, refresh],
  );

  return <AgentActivityContext.Provider value={value}>{children}</AgentActivityContext.Provider>;
}

export function useAgentActivity(): AgentActivityValue {
  return useContext(AgentActivityContext);
}

function workingLabel(runs: RunSummary[]): string {
  const agents = new Set(runs.map((r) => r.agent_label));
  if (agents.size === 1 && runs.length === 1) return `${runs[0].agent_label} working`;
  const n = runs.length;
  return `${n} agent${n === 1 ? "" : "s"} working`;
}

/** Top-bar indicator: "2 agents working" with a popover of live and recent runs. */
export function AgentActivityIndicator() {
  const activity = useAgentActivity();
  const { refresh } = activity;
  const { navigate } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const working = activity.running > 0;
  const label = working ? workingLabel(activity.runs) : "Team idle";

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect)
      setPosition({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
  }, []);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    panelRef.current?.focus();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    refresh();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", place);
    };
  }, [open, close, place, refresh]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`agent-activity${working ? " is-working" : ""}${open ? " is-open" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {working ? <span className="agent-activity__dot" aria-hidden /> : <IconUsers size={13} />}
        <span aria-live="polite">{label}</span>
      </button>
      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label="Agent activity"
            tabIndex={-1}
            className="agent-popover"
            style={{ top: position.top, right: position.right }}
          >
            <ActivityPopoverBody
              activity={activity}
              onOpenTeam={() => {
                close(false);
                navigate({ area: "team", tab: "runs" });
              }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}

function ActivityPopoverBody({
  activity,
  onOpenTeam,
}: {
  activity: AgentActivityValue;
  onOpenTeam: () => void;
}) {
  const clock = useNow(true);
  const now = clock + activity.skewMs;
  return (
    <>
      <div className="agent-popover__section">
        <p className="agent-popover__caption">Working now</p>
        {activity.runs.length === 0 ? (
          <p className="agent-popover__empty">
            {activity.loaded ? "No agents are working right now." : "Checking on your agents…"}
          </p>
        ) : (
          <ul className="agent-popover__list">
            {activity.runs.map((run) => (
              <li key={run.id} className="agent-popover__row">
                <Monogram name={run.agent_label} shape="square" />
                <span className="agent-popover__text">
                  <span className="agent-popover__agent">{run.agent_label}</span>
                  <span className="agent-popover__task">{run.task}</span>
                </span>
                <span
                  className="agent-popover__timer mono tabular"
                  aria-label={`running for ${elapsed(now - Date.parse(run.started_at))}`}
                >
                  <span className="agent-activity__dot" aria-hidden />
                  {elapsed(now - Date.parse(run.started_at))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {activity.recent.length > 0 && (
        <div className="agent-popover__section">
          <p className="agent-popover__caption">Recent</p>
          <ul className="agent-popover__list">
            {activity.recent.map((run) => (
              <li key={run.id} className="agent-popover__row">
                <Monogram name={run.agent_label} shape="square" />
                <span className="agent-popover__text">
                  <span className="agent-popover__agent">{run.agent_label}</span>
                  <span className="agent-popover__task">{run.task}</span>
                </span>
                <span className="agent-popover__meta">
                  <StatusPill tone={run.status === "stale" ? "orange" : statusTone(run.status)}>
                    {runStatusLabel(run.status)}
                  </StatusPill>
                  <span className="text-3 tabular">
                    {run.duration_ms != null ? `${duration(run.duration_ms)} · ` : ""}
                    {timeAgo(run.finished_at ?? run.started_at, now)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {activity.error && (
        <p className="agent-popover__error" role="alert">
          {activity.error}
        </p>
      )}

      <div className="agent-popover__footer">
        <Button
          size="xs"
          variant="secondary"
          onClick={onOpenTeam}
          icon={<IconArrowRight size={12} />}
        >
          Open Team
        </Button>
      </div>
    </>
  );
}
