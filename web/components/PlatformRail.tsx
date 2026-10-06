"use client";

import type { MarketingConfig, MarketingCrmEntry } from "@/lib/marketingTypes";

interface PlatformRailProps {
  config: MarketingConfig;
  entries: MarketingCrmEntry[];
  activeFilter: "all" | "x" | "instagram";
  onFilter: (filter: "all" | "x" | "instagram") => void;
  onOpenSettings: () => void;
}

export default function PlatformRail({
  config,
  entries,
  activeFilter,
  onFilter,
  onOpenSettings,
}: PlatformRailProps) {
  const xLeads = entries.filter((e) => e.type === "x_lead");
  const creators = entries.filter((e) => e.type === "creator");
  const xActive = xLeads.filter(
    (e) => e.status === "in_conversation" || e.status === "contacted",
  ).length;
  const creatorsNegotiating = creators.filter(
    (e) => e.status === "negotiating" || e.status === "contacted",
  ).length;

  return (
    <aside className="platform-rail">
      <div className="section-head">
        <p className="label-caps">Platforms</p>
        <button type="button" className="link-button mono" onClick={onOpenSettings}>
          settings
        </button>
      </div>
      <div className="platform-rail__list">
        {config.platforms.includes("x") && (
          <button
            type="button"
            className="kraft-card is-interactive platform-card"
            aria-pressed={activeFilter === "x"}
            onClick={() => onFilter(activeFilter === "x" ? "all" : "x")}
          >
            <strong className="platform-card__name">X (Twitter)</strong>
            <p className="mono meta-line">
              {xLeads.length} leads · {xActive} active
            </p>
            <p className="mono meta-line">Budget: ${config.x_boost_budget ?? 0}/mo</p>
          </button>
        )}
        {config.platforms.includes("instagram") && (
          <button
            type="button"
            className="kraft-card is-interactive platform-card"
            aria-pressed={activeFilter === "instagram"}
            onClick={() => onFilter(activeFilter === "instagram" ? "all" : "instagram")}
          >
            <strong className="platform-card__name">Instagram</strong>
            <p className="mono meta-line">
              {creators.length} creators · {creatorsNegotiating} negotiating
            </p>
            <p className="mono meta-line">
              Offer: ${config.ig_offer_min ?? 0}–${config.ig_offer_max ?? 0}
            </p>
          </button>
        )}
      </div>
    </aside>
  );
}
