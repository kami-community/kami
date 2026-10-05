/**
 * Runtime capability registry for Community Edition.
 * Agents and UI must choose modes only from declared capabilities.
 */

export type ResearchMode = "browser" | "provider" | "manual";

export interface KamiCapabilities {
  hermes: boolean;
  modelConfigured: boolean;
  database: boolean;
  browserConnected: boolean;
  researchProvider: boolean;
  researchProviders: string[];
  agentMail: boolean;
  xConfigured: boolean;
  researchModes: ResearchMode[];
  canSendEmail: boolean;
  canPublishX: boolean;
  notes: string[];
}

function hasEnv(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

export function detectCapabilities(): KamiCapabilities {
  const hermes = hasEnv("HERMES_GATEWAY_URL") || hasEnv("HERMES_API_KEY");
  const modelConfigured = hasEnv("HERMES_API_KEY");
  const database = hasEnv("NEXT_PUBLIC_SUPABASE_URL") && hasEnv("SUPABASE_SERVICE_ROLE_KEY");
  const browserConnected = hasEnv("HERMES_BROWSER_CDP_URL");
  const providers: string[] = [];
  if (hasEnv("LINKUP_API_KEY")) providers.push("linkup");
  if (hasEnv("EXA_API_KEY")) providers.push("exa");
  if (hasEnv("TAVILY_API_KEY")) providers.push("tavily");
  if (hasEnv("FIRECRAWL_API_KEY")) providers.push("firecrawl");
  const researchProvider = providers.length > 0;
  const agentMail = hasEnv("AGENTMAIL_API_KEY");
  const xConfigured = hasEnv("X_CLIENT_ID") && hasEnv("X_CLIENT_SECRET");

  const researchModes: ResearchMode[] = ["manual"];
  if (browserConnected) researchModes.unshift("browser");
  if (researchProvider) researchModes.push("provider");

  const notes: string[] = [];
  if (!modelConfigured) notes.push("Set HERMES_API_KEY to match your local Hermes API_SERVER_KEY.");
  if (!database)
    notes.push("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for persistence.");
  if (!browserConnected && !researchProvider) {
    notes.push("No browser CDP or research provider — agents will ask for manual domains/URLs.");
  }
  if (!agentMail) notes.push("No AgentMail — Sales can draft but Send stays hidden.");
  if (!xConfigured)
    notes.push("No X OAuth — Marketing can draft opportunities; Publish stays hidden.");

  return {
    hermes,
    modelConfigured,
    database,
    browserConnected,
    researchProvider,
    researchProviders: providers,
    agentMail,
    xConfigured,
    researchModes,
    canSendEmail: agentMail,
    canPublishX: xConfigured,
    notes,
  };
}

/** Compact string for Hermes prompts. */
export function capabilitiesPromptBlock(caps: KamiCapabilities): string {
  return [
    "CAPABILITY REGISTRY (use only available modes; never pretend a missing tool works)",
    `Hermes gateway key: ${caps.modelConfigured ? "yes" : "no"}`,
    `Database: ${caps.database ? "yes" : "no"}`,
    `Browser CDP: ${caps.browserConnected ? "yes" : "no"}`,
    `Research providers: ${caps.researchProviders.length ? caps.researchProviders.join(", ") : "none"}`,
    `Research modes: ${caps.researchModes.join(", ")}`,
    `AgentMail send: ${caps.canSendEmail ? "yes" : "no — drafts only"}`,
    `X publish: ${caps.canPublishX ? "yes" : "no — drafts only"}`,
    caps.notes.length ? `Notes: ${caps.notes.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
