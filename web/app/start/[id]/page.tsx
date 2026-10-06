"use client";

import { useParams } from "next/navigation";
import { useCampaign } from "@/components/campaign/CampaignProvider";
import ChooseStep from "@/components/onboarding/ChooseStep";
import ConfirmStep from "@/components/onboarding/ConfirmStep";
import OnboardingFrame from "@/components/onboarding/OnboardingFrame";
import CampaignGate from "@/components/shell/CampaignGate";

/**
 * Onboarding steps 2–3 for a campaign. The step comes from the server: no
 * confirmed dossier → Confirm; confirmed → Choose a first job.
 */
export default function OnboardingPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <CampaignGate id={id} require="any">
      <Steps />
    </CampaignGate>
  );
}

function Steps() {
  const { session, sessionId } = useCampaign();
  const confirmed = Boolean(session.dossier_confirmed_at);
  return (
    <OnboardingFrame step={confirmed ? 3 : 2} campaignId={sessionId}>
      {confirmed ? <ChooseStep /> : <ConfirmStep />}
    </OnboardingFrame>
  );
}
