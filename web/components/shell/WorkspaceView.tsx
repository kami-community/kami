"use client";

import ActivityArea from "@/components/areas/ActivityArea";
import DistributionArea from "@/components/areas/DistributionArea";
import HomeArea from "@/components/areas/HomeArea";
import InboxArea from "@/components/areas/InboxArea";
import SalesArea from "@/components/areas/SalesArea";
import SettingsArea from "@/components/areas/SettingsArea";
import TeamArea from "@/components/areas/TeamArea";
import { useWorkspace } from "@/components/shell/WorkspaceContext";

/** Routes the current workspace view (from the URL) to its area screen. */
export default function WorkspaceView() {
  const { view } = useWorkspace();
  switch (view.area) {
    case "home":
      return <HomeArea />;
    case "inbox":
      return <InboxArea />;
    case "sales":
      return <SalesArea tab={view.tab} />;
    case "distribution":
      return <DistributionArea tab={view.tab} />;
    case "team":
      return <TeamArea tab={view.tab} />;
    case "activity":
      return <ActivityArea tab={view.tab} />;
    case "settings":
      return <SettingsArea tab={view.tab} />;
  }
}
