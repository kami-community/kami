"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback } from "react";
import AgentRuns from "@/components/activity/AgentRuns";
import HermesState from "@/components/activity/HermesState";
import { useCampaign } from "@/components/campaign/CampaignProvider";
import { useAgentActivity } from "@/components/shell/AgentActivity";
import AreaTabs, { type AreaTab } from "@/components/shell/AreaTabs";
import { useWorkspace } from "@/components/shell/WorkspaceContext";
import AgentGrid from "@/components/team/AgentGrid";
import { Page, PageHeader } from "@/components/ui/Page";
import Skeleton from "@/components/ui/Skeleton";
import { TEAM_TABS, type TeamTab } from "@/lib/client/routes";

/**
 * Team: the Hermes agents working on this campaign — who they are, what they
 * are doing right now, every run they made, and Hermes' own ledger.
 */
export default function TeamArea({ tab }: { tab: TeamTab }) {
  const { sessionId, session } = useCampaign();
  const { href, navigate } = useWorkspace();
  const { running } = useAgentActivity();
  const company = session.domain_check?.company_name ?? session.canonical_domain;

  const tabs: AreaTab<TeamTab>[] = TEAM_TABS.map((t) => ({
    ...t,
    href: href({ area: "team", tab: t.key }),
    count: t.key === "runs" && running > 0 ? running : undefined,
  }));

  return (
    <Page wide>
      <PageHeader
        title="Team"
        lede={`The Hermes agents working on ${company}. Each one runs a role with its own skills; nothing they produce reaches the world without your approval.`}
      />
      <AreaTabs
        label="Team"
        tabs={tabs}
        active={tab}
        onSelect={(key) => navigate({ area: "team", tab: key })}
      />
      <div className="fade-up" key={tab}>
        {tab === "hermes" ? (
          <HermesState sessionId={sessionId} />
        ) : (
          <Suspense fallback={<Skeleton title lines={6} />}>
            <TeamTabBody tab={tab} sessionId={sessionId} />
          </Suspense>
        )}
      </div>
    </Page>
  );
}

/** Agents and Runs share the `?agent=` filter, so an agent's runs have a linkable URL. */
function TeamTabBody({ tab, sessionId }: { tab: Exclude<TeamTab, "hermes">; sessionId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { href } = useWorkspace();
  const agent = params.get("agent");

  const showRuns = useCallback(
    (name: string | null, replace: boolean) => {
      const url = `${href({ area: "team", tab: "runs" })}${name ? `?agent=${encodeURIComponent(name)}` : ""}`;
      if (replace) router.replace(url, { scroll: false });
      else router.push(url);
    },
    [href, router],
  );

  if (tab === "agents")
    return <AgentGrid sessionId={sessionId} onOpenAgent={(name) => showRuns(name, false)} />;
  return (
    <AgentRuns sessionId={sessionId} agent={agent} onAgentChange={(name) => showRuns(name, true)} />
  );
}
