"use client";

import type { SalesSegment } from "@/lib/domain/segments";
import type { SalesPlan } from "@/lib/salesTypes";
import SalesBusyOverlay from "@/components/SalesBusyOverlay";
import SalesFunnel from "@/components/SalesFunnel";
import { AccountGroups } from "./AccountCard";
import {
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

const BUSY_COPY: Record<Exclude<BusyMode, null>, { title: string; stages?: string[] }> = {
  discover: { title: "Finding companies" },
  emails: {
    title: "Finding contact emails",
    stages: [
      "Scraping company contact pages…",
      "Searching the web for @domain emails…",
      "Asking Hermes to extract only evidenced addresses…",
      "Saving verified contacts…",
    ],
  },
  continue: {
    title: "Building sequences",
    stages: ["Saving emails…", "Enrolling sequences…", "Queueing drafts…"],
  },
};

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

  if (!planApproved) {
    return (
      <div className="kraft-card target-review">
        <p className="label-caps">Find companies</p>
        <p className="mono muted">
          Approve your plan first, then we&apos;ll research companies that match your confirmed
          segments.
        </p>
      </div>
    );
  }

  const seeds = hasB2bSeeds(segments);
  const distributionPath =
    isPlgOnly(segments) || onlyPlgWarnings(accounts.length, notices.warnings);
  const included = accounts.filter((a) => a.id && isIncluded(a));
  const primary = primaryAction({
    distributionPath,
    canCreateDistribution: Boolean(onCreateDistribution),
    hasB2bSeeds: seeds,
    accountCount: accounts.length,
    includedCount: included.length,
    missingEmailSelected: included.filter((a) => !hasEligibleEmail(a)).length,
    missingEmailAny: accounts.filter((a) => !a.contact?.email).length,
  });
  const busy = busyMode ? BUSY_COPY[busyMode] : null;

  return (
    <div className="kraft-card target-review">
      {busy && (
        <SalesBusyOverlay title={busy.title} stages={busy.stages} detail={review.busyDetail} />
      )}

      {offer && (
        <p className="mono muted target-offer">
          Selling: {offer.slice(0, 160)}
          {offer.length > 160 ? "…" : ""}
        </p>
      )}

      <SalesFunnel segments={segments} plan={plan} accounts={accounts} />

      {distributionPath ? (
        <div className="target-intro">
          <p className="sales-intro">
            These segments are individual buyers/users, not companies to email-blast. Company Find
            does not apply — we will not invent consumer emails.
          </p>
          <p className="mono muted">
            Next step: create a distribution campaign (X, Reddit, etc.) so the right people find
            you. If you also have B2B seed companies, add them under Confirm ICP and use Find
            companies.
          </p>
        </div>
      ) : (
        <p className="sales-intro target-intro">
          We verify named companies from your segments, look up public emails (site → web search →
          Hermes), and score Fit × Timing. Check Include, then continue.
        </p>
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
      <hr className="crease" />

      <TargetNotices {...notices} />
      {review.loadError && (
        <p className="form-error" role="alert">
          Could not load companies: {review.loadError}
        </p>
      )}
      {review.loading && !accounts.length ? (
        <p className="mono muted">Loading companies…</p>
      ) : (
        <AccountGroups
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
    </div>
  );
}
