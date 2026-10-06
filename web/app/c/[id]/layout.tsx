"use client";

import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import CampaignGate from "@/components/shell/CampaignGate";
import WorkspaceShell from "@/components/shell/WorkspaceShell";

/** The campaign workspace: loaded once, kept mounted while the founder moves between views. */
export default function CampaignLayout({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  return (
    <CampaignGate id={id} require="confirmed">
      <WorkspaceShell>{children}</WorkspaceShell>
    </CampaignGate>
  );
}
