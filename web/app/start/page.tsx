import CompanyStep from "@/components/onboarding/CompanyStep";
import OnboardingFrame from "@/components/onboarding/OnboardingFrame";

/** Onboarding step 1 — the founder's domain. */
export default function StartPage() {
  return (
    <OnboardingFrame step={1}>
      <CompanyStep />
    </OnboardingFrame>
  );
}
