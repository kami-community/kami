"use client";

import Tabs from "@/components/Tabs";
import type { CampaignTab } from "@/lib/marketingTypes";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "sales", label: "Sales" },
  { id: "marketing", label: "Marketing" },
] as const satisfies readonly { id: CampaignTab; label: string }[];

export default function CampaignTabs({
  active,
  onChange,
}: {
  active: CampaignTab;
  onChange: (tab: CampaignTab) => void;
}) {
  return <Tabs tabs={TABS} active={active} onChange={onChange} label="Campaign" />;
}
