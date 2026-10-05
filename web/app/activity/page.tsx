"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import AgentRuns from "@/components/activity/AgentRuns";
import HermesState from "@/components/activity/HermesState";
import OutboundLog from "@/components/activity/OutboundLog";
import SuppressionList from "@/components/activity/SuppressionList";
import Tabs from "@/components/Tabs";

const TABS = [
  { id: "outbound", label: "Outbound" },
  { id: "runs", label: "Agent runs" },
  { id: "suppressions", label: "Suppressions" },
  { id: "hermes", label: "Hermes" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function savedSessionId(): string | null {
  try {
    return (
      (JSON.parse(localStorage.getItem("kami_session") ?? "{}") as { dbId?: string }).dbId ?? null
    );
  } catch {
    return null;
  }
}

function ActivityView() {
  const param = useSearchParams().get("session_id");
  const [sessionId] = useState(
    () => param ?? (typeof window === "undefined" ? null : savedSessionId()),
  );
  const [tab, setTab] = useState<TabId>("outbound");

  if (!sessionId) {
    return (
      <p className="muted">
        No campaign selected. <Link href="/">Open a campaign</Link> first.
      </p>
    );
  }

  return (
    <>
      <Tabs tabs={TABS} active={tab} onChange={setTab} label="Activity" />
      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="activity-panel"
      >
        {tab === "outbound" && <OutboundLog sessionId={sessionId} />}
        {tab === "runs" && <AgentRuns sessionId={sessionId} />}
        {tab === "suppressions" && <SuppressionList sessionId={sessionId} />}
        {tab === "hermes" && <HermesState sessionId={sessionId} />}
      </div>
    </>
  );
}

export default function ActivityPage() {
  return (
    <main className="container-wide dashboard">
      <header className="dashboard__header">
        <h2>
          Activity <span className="brand-accent">· every action, with proof</span>
        </h2>
        <Link className="mono btn-outline" href="/">
          ← back to campaign
        </Link>
      </header>
      <hr className="crease" />
      <Suspense>
        <ActivityView />
      </Suspense>
    </main>
  );
}
