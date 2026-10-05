import { buildCompanyContextPack } from "@/lib/campaigns/contextPack";
import { getCampaign } from "@/lib/campaigns/sessions";
import type { Db } from "@/lib/db/client";
import { streamResponse } from "@/lib/hermes/client";
import type { SalesCampaignConfig } from "@/lib/salesTypes";

export type GuideJob = "find_customers" | "create_distribution";

/**
 * Ask Kami Guide. The server assembles a fresh context pack from the stored
 * campaign every turn; the browser only sends the question. Streams SSE.
 */
export async function askGuide(
  db: Db,
  params: { sessionId: string; question: string; activeJob: GuideJob | null },
): Promise<Response> {
  const { session, dossier } = await getCampaign(db, params.sessionId);
  const { data: sales } = await db
    .from("sales_campaigns")
    .select("offer, icp, geo, target_quantity, segments, segments_confirmed_at")
    .eq("session_id", params.sessionId)
    .maybeSingle();

  const pack = buildCompanyContextPack({
    dossier,
    domain: session.canonical_domain,
    canonicalDomain: session.canonical_domain,
    salesConfig: (sales as SalesCampaignConfig | null) ?? null,
    goals: session.goals,
    stage: session.stage,
    activeJob: params.activeJob,
    researchProvenance: {
      sourceCount: session.research_snapshot?.sources?.length,
      firstPartyCount: session.research_snapshot?.sources?.filter(
        (s) => s.source_class === "first_party",
      ).length,
      confidence: session.domain_check?.confidence,
      evidenceUrls: dossier?.evidence_urls,
    },
    blockers:
      dossier && !session.dossier_confirmed_at
        ? ["Dossier not yet confirmed by the founder"]
        : null,
  });

  return streamResponse({
    agent: "guide",
    kind: "ask_kami",
    kamiSessionId: params.sessionId,
    continuity: "campaign",
    input: `=== COMPANY CONTEXT PACK (authoritative for this turn) ===\n${pack}\n=== END PACK ===\n\nFounder question: ${params.question}`,
  });
}
