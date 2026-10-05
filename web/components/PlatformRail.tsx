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
    <aside>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--stack-sm)",
        }}
      >
        <p className="label-caps">Platforms</p>
        <button
          type="button"
          className="mono"
          onClick={onOpenSettings}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--ink-soft)",
            fontSize: 11,
          }}
        >
          settings
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack-sm)" }}>
        {config.platforms.includes("x") && (
          <button
            type="button"
            className="kraft-card"
            onClick={() => onFilter(activeFilter === "x" ? "all" : "x")}
            style={{
              padding: "1rem",
              cursor: "pointer",
              textAlign: "left",
              border: activeFilter === "x" ? "2px solid var(--hanko)" : "1px solid var(--ink)",
            }}
          >
            <strong style={{ fontFamily: "var(--font-headline)" }}>X (Twitter)</strong>
            <p
              className="mono"
              style={{ color: "var(--ink-soft)", marginTop: "0.4rem", fontSize: 12 }}
            >
              {xLeads.length} leads · {xActive} active
            </p>
            <p className="mono" style={{ color: "var(--ink-soft)", fontSize: 12 }}>
              Budget: ${config.x_boost_budget ?? 0}/mo
            </p>
          </button>
        )}
        {config.platforms.includes("instagram") && (
          <button
            type="button"
            className="kraft-card"
            onClick={() => onFilter(activeFilter === "instagram" ? "all" : "instagram")}
            style={{
              padding: "1rem",
              cursor: "pointer",
              textAlign: "left",
              border:
                activeFilter === "instagram" ? "2px solid var(--hanko)" : "1px solid var(--ink)",
            }}
          >
            <strong style={{ fontFamily: "var(--font-headline)" }}>Instagram</strong>
            <p
              className="mono"
              style={{ color: "var(--ink-soft)", marginTop: "0.4rem", fontSize: 12 }}
            >
              {creators.length} creators · {creatorsNegotiating} negotiating
            </p>
            <p className="mono" style={{ color: "var(--ink-soft)", fontSize: 12 }}>
              Offer: ${config.ig_offer_min ?? 0}–${config.ig_offer_max ?? 0}
            </p>
          </button>
        )}
      </div>
    </aside>
  );
}
