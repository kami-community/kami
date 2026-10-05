import { getCampaign } from "@/lib/campaigns/sessions";
import type { Db } from "@/lib/db/client";
import { AppError, badRequest, upstreamFailed } from "@/lib/http/errors";
import { runMarketingDiscovery } from "@/lib/marketingDiscover";
import type { MarketingPlatform } from "@/lib/marketingTypes";
import { assertNotPaused } from "@/lib/outbound/policy";
import { prepareDiscoveredEntries, upsertCrmEntries } from "./crm";
import { requireMarketingConfig } from "./setup";

/**
 * Find real X leads / Instagram creators for the campaign and add them to the
 * CRM. Refuses while the campaign or Marketing is paused.
 */
export async function discoverCrmEntries(
  db: Db,
  sessionId: string,
): Promise<{
  triggered: true;
  platforms: MarketingPlatform[];
  created: number;
  updated: number;
  handles: string[];
  warnings: string[];
  message: string;
}> {
  await assertNotPaused(db, sessionId, "marketing");
  const config = await requireMarketingConfig(db, sessionId);
  const platforms = config.platforms;
  if (!platforms.length) throw badRequest("no platforms configured for discovery");

  const { session, dossier } = await getCampaign(db, sessionId);

  let discovered;
  try {
    discovered = await runMarketingDiscovery({
      config,
      domain: session.canonical_domain || session.domain,
      dossier,
      sessionId,
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw upstreamFailed(err instanceof Error ? err.message : "discovery failed");
  }

  if (discovered.needsInput) {
    throw upstreamFailed(discovered.needsInput.message, {
      needs_input: discovered.needsInput,
      warnings: discovered.warnings ?? [],
    });
  }

  const entries = prepareDiscoveredEntries(discovered.entries, {
    platforms,
    offerMin: config.ig_offer_min,
    offerMax: config.ig_offer_max,
  });
  const { created, updated } = await upsertCrmEntries(db, sessionId, entries);

  return {
    triggered: true,
    platforms,
    created: created.length,
    updated: updated.length,
    handles: [...created, ...updated],
    warnings: discovered.warnings ?? [],
    message:
      created.length + updated.length > 0
        ? `Discovery complete — ${created.length} new, ${updated.length} updated.`
        : "Discovery finished but returned no CRM entries.",
  };
}
