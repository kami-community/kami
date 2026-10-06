"use client";

import { Section } from "@/components/ui/Page";
import type { CampaignProgress } from "@/lib/campaigns/progress";
import type { View } from "@/lib/client/routes";
import ViewLink from "./ViewLink";

interface Tile {
  key: string;
  label: string;
  value: number;
  hint: string;
  view: View;
}

/** Home → results so far, counted on the server (campaign progress). */
export default function Results({ progress }: { progress: CampaignProgress }) {
  const tiles: Tile[] = [
    {
      key: "sent",
      label: "Emails sent",
      value: progress.sales.drafts.sent,
      hint: progress.outbound.failed ? `${progress.outbound.failed} failed` : "all time",
      view: { area: "activity", tab: "sent" },
    },
    {
      key: "replies",
      label: "Replies to answer",
      value: progress.sales.needsYou.replies,
      hint: "unread",
      view: { area: "inbox" },
    },
    {
      key: "meetings",
      label: "Meeting requests",
      value: progress.sales.needsYou.meetings,
      hint: "to schedule",
      view: { area: "inbox" },
    },
    {
      key: "posts",
      label: "Posts published",
      value: progress.marketing.opportunities.published,
      hint: "by Kami or by you",
      view: { area: "distribution", tab: "opportunities" },
    },
  ];
  return (
    <Section title="Results">
      <ul className="home-stats">
        {tiles.map((t) => (
          <li key={t.key}>
            <ViewLink view={t.view} className="card home-stat">
              <span className="home-stat__label">{t.label}</span>
              <span className="home-stat__value tabular">{t.value.toLocaleString()}</span>
              <span className="home-stat__hint">{t.hint}</span>
            </ViewLink>
          </li>
        ))}
      </ul>
    </Section>
  );
}
