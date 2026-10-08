import { env } from "@/lib/config/env";
import { OAUTH_PROVIDERS } from "@/lib/connections/providers";
import { dbConfigured } from "@/lib/db/client";
import { emailConfigured, searchProviders } from "@/lib/providers";

/**
 * What this Kami install can actually do, derived from configuration and a
 * live Hermes health probe. Agents and UI choose modes only from these.
 */

export type ResearchMode = "browser" | "provider" | "manual";

export interface KamiCapabilities {
  hermes: boolean;
  hermesReachable: boolean;
  database: boolean;
  researchProviders: string[];
  researchModes: ResearchMode[];
  canSendEmail: boolean;
  canConnectX: boolean;
  canConnectInstagram: boolean;
  /** sign-in is enabled (KAMI_ADMIN_TOKEN set) */
  authRequired: boolean;
  notes: string[];
}

let probe: { at: number; ok: boolean } | null = null;
const PROBE_TTL_MS = 30_000;

async function hermesReachable(): Promise<boolean> {
  if (probe && Date.now() - probe.at < PROBE_TTL_MS) return probe.ok;
  const health = env().HERMES_GATEWAY_URL.replace(/\/v1\/chat\/completions\/?$/, "/health");
  let ok = false;
  try {
    ok = (await fetch(health, { signal: AbortSignal.timeout(2_000) })).ok;
  } catch {
    ok = false;
  }
  probe = { at: Date.now(), ok };
  return ok;
}

export async function detectCapabilities(): Promise<KamiCapabilities> {
  const c = env();
  const hermes = Boolean(c.HERMES_API_KEY);
  const reachable = hermes && (await hermesReachable());
  const providers = searchProviders().map((p) => p.id);
  const browser = Boolean(c.HERMES_BROWSER_CDP_URL);

  const researchModes: ResearchMode[] = [];
  if (browser) researchModes.push("browser");
  if (providers.length) researchModes.push("provider");
  researchModes.push("manual");

  const notes: string[] = [];
  if (!hermes) notes.push("Set HERMES_API_KEY to your Hermes API_SERVER_KEY.");
  else if (!reachable) notes.push("Hermes is not reachable — start the gateway.");
  if (!dbConfigured()) notes.push("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  if (!browser && !providers.length)
    notes.push("No browser or search provider — research uses your own site only.");
  if (!emailConfigured()) notes.push("No AgentMail — Sales drafts emails but cannot send.");

  return {
    hermes,
    hermesReachable: reachable,
    database: dbConfigured(),
    researchProviders: providers,
    researchModes,
    canSendEmail: emailConfigured(),
    canConnectX: OAUTH_PROVIDERS.x.configured(),
    canConnectInstagram: OAUTH_PROVIDERS.instagram.configured(),
    authRequired: Boolean(c.KAMI_ADMIN_TOKEN),
    notes,
  };
}

/** Compact capability summary for agent prompts. */
export function capabilitiesPromptBlock(caps: KamiCapabilities): string {
  return [
    "CAPABILITY REGISTRY (use only available modes; never pretend a missing tool works)",
    `Research providers: ${caps.researchProviders.length ? caps.researchProviders.join(", ") : "none"}`,
    `Research modes: ${caps.researchModes.join(", ")}`,
    `Email send: ${caps.canSendEmail ? "yes" : "no — drafts only"}`,
    `X posting: ${caps.canConnectX ? "available once the founder connects X" : "no — drafts only"}`,
  ].join("\n");
}
