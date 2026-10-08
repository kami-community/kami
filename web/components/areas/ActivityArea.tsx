"use client";

import OutboundLog from "@/components/activity/OutboundLog";
import SuppressionList from "@/components/activity/SuppressionList";
import { useCampaign } from "@/components/campaign/CampaignProvider";
import AreaTabs, { type AreaTab } from "@/components/shell/AreaTabs";
import { useWorkspace } from "@/components/shell/WorkspaceContext";
import { Page, PageHeader } from "@/components/ui/Page";
import { ValuePill } from "@/components/ui/Pills";
import { ACTIVITY_TABS, type ActivityTab } from "@/lib/client/routes";

const LEDES: Record<ActivityTab, string> = {
  sent: "Every real email, post and DM that went out for this campaign. A provider id or a live link is the proof — not an HTTP 200.",
  suppressions:
    "People and domains Kami must never contact. Checked before every email, post and DM, on every channel.",
};

/** Activity: the proof of everything that went out, and who must never hear from Kami. */
export default function ActivityArea({ tab }: { tab: ActivityTab }) {
  const { sessionId, progress } = useCampaign();
  const { href, navigate } = useWorkspace();
  const outbound = progress?.outbound;

  const tabs: AreaTab<ActivityTab>[] = ACTIVITY_TABS.map((t) => ({
    ...t,
    href: href({ area: "activity", tab: t.key }),
  }));

  return (
    <Page wide>
      <PageHeader
        title="Activity"
        lede={LEDES[tab]}
        eyebrow={
          outbound && (outbound.sent > 0 || outbound.failed > 0) ? (
            <span className="activity-summary">
              <ValuePill tone="green">{outbound.sent} sent</ValuePill>
              {outbound.failed > 0 && <ValuePill tone="red">{outbound.failed} failed</ValuePill>}
              {outbound.lastSentAt && (
                <span>
                  last{" "}
                  {new Date(outbound.lastSentAt).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </span>
          ) : undefined
        }
      />
      <AreaTabs
        label="Activity"
        tabs={tabs}
        active={tab}
        onSelect={(key) => navigate({ area: "activity", tab: key })}
      />
      <div className="fade-up" key={tab}>
        {tab === "sent" ? (
          <OutboundLog sessionId={sessionId} />
        ) : (
          <SuppressionList sessionId={sessionId} />
        )}
      </div>
    </Page>
  );
}
