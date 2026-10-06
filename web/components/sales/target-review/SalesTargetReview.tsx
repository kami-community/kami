"use client";

import AgentWait, { type SalesAgent } from "@/components/sales/AgentWait";
import SalesFunnel from "@/components/SalesFunnel";
import Callout from "@/components/ui/Callout";
import Disclosure from "@/components/ui/Disclosure";
import Skeleton from "@/components/ui/Skeleton";
import type { SalesSegment } from "@/lib/domain/segments";
import type { SalesPlan } from "@/lib/salesTypes";
import { AccountTable } from "./AccountCard";
import {
  companies,
  hasB2bSeeds,
  hasEligibleEmail,
  isIncluded,
  isPlgOnly,
  onlyPlgWarnings,
  primaryAction,
} from "./rules";
import TargetActions, { type BusyMode } from "./TargetActions";
import TargetNotices from "./TargetNotices";
import { useTargetReview } from "./useTargetReview";

interface SalesTargetReviewProps {
  sessionDbId: string;
  plan: SalesPlan | null;
  offer?: string;
  segments?: SalesSegment[] | null;
  paused?: boolean;
  onContinue?: () => void;
  onCreateDistribution?: () => void;
}

interface Wait {
  agent: SalesAgent;
  doing: string;
  stages: string[];
}

/** Which agent is working, and on what, for each long step of Companies. */
function waitFor(
  mode: Exclude<BusyMode, null>,
  plannedCount: number | null,
  selectedCount: number,
): Wait {
  switch (mode) {
    case "discover":
      return {
        agent: "sales-researcher",
        doing: plannedCount
          ? `is checking about ${companies(plannedCount)}`
          : "is finding and checking companies",
        stages: [
          "Checking each company’s website",
          "Looking for recent signals",
          "Looking up public contact emails",
          "Reading sites that hide their email",
          "Scoring fit and timing",
        ],
      };
    case "emails":
      return {
        agent: "sales-researcher",
        doing: "is looking for public contact emails",
        stages: [
          "Reading company contact pages",
          "Searching the web for addresses on each domain",
          "Keeping only emails with evidence",
          "Saving the contacts it found",
        ],
      };
    case "continue":
      return {
        agent: "outreach",
        doing: `is drafting emails for ${companies(selectedCount)}`,
        stages: [
          "Saving contacts",
          "Setting up each email sequence",
          "Writing first drafts",
          "Checking each draft",
        ],
      };
  }
}

/** Find step: verify target companies, find or add contact emails, pick who gets drafts. */
export default function SalesTargetReview({
  sessionDbId,
  plan,
  offer,
  segments,
  paused = false,
  onContinue,
  onCreateDistribution,
}: SalesTargetReviewProps) {
  const planApproved = plan?.status === "approved";
  const review = useTargetReview(sessionDbId, planApproved, onContinue);
  const { accounts, notices, busyMode } = review;
  const seeds = hasB2bSeeds(segments);
  const distributionPath =
    isPlgOnly(segments) || onlyPlgWarnings(accounts.length, notices.warnings);
  const included = accounts.filter((a) => a.id && isIncluded(a));
  const planned =
    plan?.estimated_activity?.accounts_to_research ??
    ((segments ?? []).reduce((n, seg) => n + (seg.target_count || 0), 0) || null);
  const wait = busyMode ? waitFor(busyMode, planned, included.length) : null;
  const scored = accounts.some((a) => a.score);
  const primary = primaryAction({
    distributionPath,
    canCreateDistribution: Boolean(onCreateDistribution),
    hasB2bSeeds: seeds,
    accountCount: accounts.length,
    includedCount: included.length,
    missingEmailSelected: included.filter((a) => !hasEligibleEmail(a)).length,
    missingEmailAny: accounts.filter((a) => !a.contact?.email).length,
  });

  return (
    <div className="sales-companies">
      {distributionPath && (
        <Callout tone="info" title="These buyers are individuals, not companies to email">
          Kami won’t guess personal emails. Create distribution so the right people find you
          instead. If you also sell to companies, add real ones under Plan → Who you sell to.
        </Callout>
      )}

      {wait && (
        <AgentWait
          agent={wait.agent}
          doing={wait.doing}
          stages={wait.stages}
          detail={review.busyDetail}
          stepMs={4000}
          note="Websites are checked live, so this can take a minute or two."
        />
      )}

      <TargetNotices {...notices} />

      {review.loadError && (
        <Callout tone="error">Could not load companies: {review.loadError}</Callout>
      )}
      {review.loading && !accounts.length ? (
        <Skeleton title lines={5} />
      ) : (
        <AccountTable
          accounts={accounts}
          segments={segments}
          emailDrafts={review.emailDrafts}
          savingEmailId={review.savingEmailId}
          disabled={busyMode !== null}
          onToggle={review.toggle}
          onEmailDraft={review.setEmailDraft}
          onSaveEmail={(acc) => void review.saveEmail(acc)}
        />
      )}

      {scored && (
        <Disclosure label="How these companies score">
          <div className="stack stack--sm">
            {offer && (
              <p className="text-3 text-xs">
                Scored against: {offer.slice(0, 160)}
                {offer.length > 160 ? "…" : ""}
              </p>
            )}
            <SalesFunnel segments={segments} plan={plan} accounts={accounts} show="scores" />
          </div>
        </Disclosure>
      )}

      <TargetActions
        primary={primary}
        distributionPath={distributionPath}
        showDiscover={seeds}
        showDistribution={distributionPath}
        accountCount={accounts.length}
        includedCount={included.length}
        busyMode={busyMode}
        paused={paused}
        onDiscover={review.discover}
        onFindEmails={review.findEmails}
        onDraft={review.draftEmails}
        onCreateDistribution={onCreateDistribution}
      />
    </div>
  );
}
