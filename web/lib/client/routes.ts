/**
 * The workspace URL scheme: `/c/<campaign>/<area>/<tab>`. Every screen has a
 * real, linkable URL, so reloads, Back/Forward and shared links land in place.
 * Browser-safe and pure.
 */

export type SalesTab = "plan" | "companies" | "emails" | "pipeline";
export type DistributionTab = "opportunities" | "plan" | "boosts" | "creators";
export type TeamTab = "agents" | "runs" | "hermes";
export type ActivityTab = "sent" | "suppressions";
export type SettingsTab = "company" | "sending" | "connections";

export type View =
  | { area: "home" }
  | { area: "inbox" }
  | { area: "sales"; tab: SalesTab }
  | { area: "distribution"; tab: DistributionTab }
  | { area: "team"; tab: TeamTab }
  | { area: "activity"; tab: ActivityTab }
  | { area: "settings"; tab: SettingsTab };

export type Area = View["area"];

export const SALES_TABS: { key: SalesTab; label: string }[] = [
  { key: "plan", label: "Plan" },
  { key: "companies", label: "Companies" },
  { key: "emails", label: "Emails" },
  { key: "pipeline", label: "Pipeline" },
];

export const DISTRIBUTION_TABS: { key: DistributionTab; label: string; advanced?: boolean }[] = [
  { key: "opportunities", label: "Opportunities" },
  { key: "plan", label: "Plan" },
  { key: "boosts", label: "Boosts", advanced: true },
  { key: "creators", label: "Creators", advanced: true },
];

export const TEAM_TABS: { key: TeamTab; label: string }[] = [
  { key: "agents", label: "Agents" },
  { key: "runs", label: "Runs" },
  { key: "hermes", label: "Hermes" },
];

export const ACTIVITY_TABS: { key: ActivityTab; label: string }[] = [
  { key: "sent", label: "Sent log" },
  { key: "suppressions", label: "Do not contact" },
];

export const SETTINGS_TABS: { key: SettingsTab; label: string }[] = [
  { key: "company", label: "Company" },
  { key: "sending", label: "Sending" },
  { key: "connections", label: "Connections" },
];

export const AREA_LABELS: Record<Area, string> = {
  home: "Home",
  inbox: "Inbox",
  sales: "Find customers",
  distribution: "Distribution",
  team: "Team",
  activity: "Activity",
  settings: "Settings",
};

const SEGMENTS: Record<Exclude<Area, "home" | "inbox">, string> = {
  sales: "sales",
  distribution: "distribution",
  team: "team",
  activity: "activity",
  settings: "settings",
};

function pick<T extends string>(tabs: { key: T }[], value: string | undefined): T {
  return tabs.find((t) => t.key === value)?.key ?? tabs[0].key;
}

/** Parse the path segments after `/c/<id>` into a view. Unknown paths land on Home. */
export function parseViewPath(segments: readonly string[] | undefined): View {
  const [area, tab] = segments ?? [];
  switch (area) {
    case "inbox":
      return { area: "inbox" };
    case "sales":
      return { area: "sales", tab: pick(SALES_TABS, tab) };
    case "distribution":
      return { area: "distribution", tab: pick(DISTRIBUTION_TABS, tab) };
    case "team":
      return { area: "team", tab: pick(TEAM_TABS, tab) };
    case "activity":
      return { area: "activity", tab: pick(ACTIVITY_TABS, tab) };
    case "settings":
      return { area: "settings", tab: pick(SETTINGS_TABS, tab) };
    default:
      return { area: "home" };
  }
}

/** The URL of a view inside a campaign. */
export function viewHref(campaignId: string, view: View): string {
  const base = `/c/${campaignId}`;
  if (view.area === "home") return base;
  if (view.area === "inbox") return `${base}/inbox`;
  return `${base}/${SEGMENTS[view.area]}/${view.tab}`;
}

/** Human label of a view's tab (for breadcrumbs), or null for single-page areas. */
export function tabLabel(view: View): string | null {
  switch (view.area) {
    case "sales":
      return SALES_TABS.find((t) => t.key === view.tab)?.label ?? null;
    case "distribution":
      return DISTRIBUTION_TABS.find((t) => t.key === view.tab)?.label ?? null;
    case "team":
      return TEAM_TABS.find((t) => t.key === view.tab)?.label ?? null;
    case "activity":
      return ACTIVITY_TABS.find((t) => t.key === view.tab)?.label ?? null;
    case "settings":
      return SETTINGS_TABS.find((t) => t.key === view.tab)?.label ?? null;
    default:
      return null;
  }
}

/** Short stable key for a view (Kami Guide focus, React keys). */
export function viewKey(view: View): string {
  return "tab" in view ? `${view.area}.${view.tab}` : view.area;
}
