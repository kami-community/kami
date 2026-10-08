"use client";

import Button from "@/components/ui/Button";
import Card, { CardFooter } from "@/components/ui/Card";
import { IconBuilding, IconMail, IconMegaphone, IconSearch } from "@/components/ui/icons";
import { companies, type PrimaryAction } from "./rules";

export type BusyMode = "discover" | "emails" | "continue" | null;

interface TargetActionsProps {
  primary: PrimaryAction;
  distributionPath: boolean;
  showDiscover: boolean;
  showDistribution: boolean;
  accountCount: number;
  includedCount: number;
  busyMode: BusyMode;
  paused: boolean;
  onDiscover: () => void;
  onFindEmails: () => void;
  onDraft: () => void;
  onCreateDistribution?: () => void;
}

/** The Find step's action bar. Exactly one action is the accent at a time. */
export default function TargetActions({
  primary,
  distributionPath,
  showDiscover,
  showDistribution,
  accountCount,
  includedCount,
  busyMode,
  paused,
  onDiscover,
  onFindEmails,
  onDraft,
  onCreateDistribution,
}: TargetActionsProps) {
  const busy = busyMode !== null;
  const variant = (action: PrimaryAction) => (primary === action ? "accent" : "secondary");

  return (
    <Card tone="flat" className="sticky-actions">
      <CardFooter plain>
        <span className="text-3 text-xs">
          {paused
            ? "Sales is paused. Resume it to find companies or emails."
            : distributionPath
              ? "These buyers are individuals. Reach them through distribution."
              : accountCount
                ? `${companies(accountCount)} · ${includedCount} selected for drafts`
                : "Start by finding companies from your plan."}
        </span>
        <span className="row row--wrap">
          {showDiscover && (
            <Button
              size="sm"
              variant={variant("discover")}
              icon={<IconSearch size={13} />}
              onClick={onDiscover}
              busy={busyMode === "discover"}
              disabled={busy || paused}
            >
              Find companies
            </Button>
          )}
          {showDistribution && onCreateDistribution && (
            <Button
              size="sm"
              variant={variant("distribution")}
              icon={<IconMegaphone size={13} />}
              onClick={onCreateDistribution}
            >
              Create distribution
            </Button>
          )}
          {!distributionPath && (
            <Button
              size="sm"
              variant={variant("find_emails")}
              icon={<IconBuilding size={13} />}
              onClick={onFindEmails}
              busy={busyMode === "emails"}
              disabled={busy || paused || !accountCount}
              title={
                accountCount
                  ? "Checks each company’s site and the web. Never guesses an email."
                  : "Available once companies are listed"
              }
            >
              Find emails
            </Button>
          )}
          {includedCount > 0 && (
            <Button
              size="sm"
              variant={variant("draft")}
              icon={<IconMail size={13} />}
              onClick={onDraft}
              busy={busyMode === "continue"}
              disabled={busy}
            >
              Draft emails for {companies(includedCount)}
            </Button>
          )}
        </span>
      </CardFooter>
    </Card>
  );
}
