import { buildCompanyContextPack } from "@/lib/campaigns/contextPack";
import { getCampaign } from "@/lib/campaigns/sessions";
import type { Db } from "@/lib/db/client";
import { encodeGuideEvent, type GuideEvent, type GuideSource } from "@/lib/domain/guideEvents";
import type { Dossier } from "@/lib/domain/dossier";
import type { ResearchSnapshot } from "@/lib/domain/research";
import { streamResponse } from "@/lib/hermes/client";
import { createSseTextParser } from "@/lib/hermes/sse";
import type { SalesCampaignConfig } from "@/lib/salesTypes";
import { createFollowUpSplitter } from "./stream";

export type GuideJob = "find_customers" | "create_distribution";

/**
 * Ask Kami Guide. The server assembles a fresh context pack from the stored
 * campaign every turn; the browser only sends the question. Streams typed
 * guide events (see lib/domain/guideEvents.ts).
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

  const started = Date.now();
  const upstream = await streamResponse({
    agent: "guide",
    kind: "ask_kami",
    kamiSessionId: params.sessionId,
    continuity: "campaign",
    input: `=== COMPANY CONTEXT PACK (authoritative for this turn) ===\n${pack}\n=== END PACK ===\n\nFounder question: ${params.question}\n\nEnd with one line: FOLLOW_UPS: <question> | <question> (two short follow-up questions the founder might ask next).`,
  });

  const sources = guideSources(dossier, session.research_snapshot);
  return new Response(toGuideEvents(upstream.body!, sources, params.activeJob, started), {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Hermes-Session-Id": upstream.headers.get("X-Hermes-Session-Id") ?? "",
    },
  });
}

/** The evidence the pack was built from, as citable sources (first-party first). */
export function guideSources(
  dossier: Pick<Dossier, "evidence_urls"> | null,
  snapshot: Pick<ResearchSnapshot, "sources"> | null | undefined,
): GuideSource[] {
  const out: GuideSource[] = [];
  const seen = new Set<string>();
  const add = (href: string, name: string) => {
    let domain: string;
    try {
      domain = new URL(href).hostname.replace(/^www\./, "");
    } catch {
      return;
    }
    if (seen.has(href)) return;
    seen.add(href);
    out.push({ name: name.trim() || domain, domain, href });
  };
  const ranked = [...(snapshot?.sources ?? [])].sort(
    (a, b) => Number(b.source_class === "first_party") - Number(a.source_class === "first_party"),
  );
  for (const s of ranked) add(s.url, s.title);
  for (const url of dossier?.evidence_urls ?? []) add(url, "");
  return out.slice(0, 8);
}

/** Re-encode Hermes' OpenAI-style SSE as Kami guide events. */
function toGuideEvents(
  body: ReadableStream<Uint8Array>,
  sources: GuideSource[],
  focus: string | null,
  started: number,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const parser = createSseTextParser();
  const splitter = createFollowUpSplitter();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: GuideEvent) => controller.enqueue(encoder.encode(encodeGuideEvent(e)));
      send({ event: "context", data: { sources, focus } });
      let produced = false;
      try {
        const reader = body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const visible = splitter.push(parser.push(decoder.decode(value, { stream: true })));
          if (visible) {
            produced = true;
            send({ event: "delta", data: { text: visible } });
          }
        }
        const tail = splitter.push(parser.end());
        const end = splitter.end();
        const rest = tail + end.text;
        if (rest) {
          produced = true;
          send({ event: "delta", data: { text: rest } });
        }
        if (!produced) {
          send({ event: "error", data: { error: "Kami Guide returned an empty answer" } });
        } else {
          if (end.followUps.length) send({ event: "followups", data: { items: end.followUps } });
          send({ event: "done", data: { durationMs: Date.now() - started } });
        }
      } catch (err) {
        send({
          event: "error",
          data: { error: err instanceof Error ? err.message : "the guide stream failed" },
        });
      } finally {
        controller.close();
      }
    },
  });
}
