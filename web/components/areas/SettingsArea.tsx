"use client";

import CompanySettings from "@/components/settings/CompanySettings";
import ConnectionsSettings from "@/components/settings/ConnectionsSettings";
import SendingSettings from "@/components/settings/SendingSettings";
import AreaTabs, { type AreaTab } from "@/components/shell/AreaTabs";
import { useWorkspace } from "@/components/shell/WorkspaceContext";
import { Page, PageHeader } from "@/components/ui/Page";
import { SETTINGS_TABS, type SettingsTab } from "@/lib/client/routes";

const LEDES: Record<SettingsTab, string> = {
  company: "Who Kami thinks you are. Every agent plans from this, so keep it accurate.",
  sending: "How fast Kami may send, what needs your OK first, and how to stop everything at once.",
  connections: "The accounts Kami posts and sends from, and what this install can do.",
};

/** Settings: company profile, sending guardrails and connections — kept out of the workflow screens. */
export default function SettingsArea({ tab }: { tab: SettingsTab }) {
  const { href, navigate } = useWorkspace();
  const tabs: AreaTab<SettingsTab>[] = SETTINGS_TABS.map((t) => ({
    ...t,
    href: href({ area: "settings", tab: t.key }),
  }));

  return (
    <Page>
      <PageHeader title="Settings" lede={LEDES[tab]} />
      <AreaTabs
        label="Settings"
        tabs={tabs}
        active={tab}
        onSelect={(key) => navigate({ area: "settings", tab: key })}
      />
      <div className="fade-up" key={tab}>
        {tab === "company" && <CompanySettings />}
        {tab === "sending" && <SendingSettings />}
        {tab === "connections" && <ConnectionsSettings />}
      </div>
    </Page>
  );
}
