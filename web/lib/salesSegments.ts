import type { Dossier } from "@/lib/domain/dossier";
import { buildCompanyContextPack } from "@/lib/campaigns/contextPack";
import { completeOrNull, hermesConfigured } from "@/lib/hermes/client";
import { parseLastJsonBlock } from "@/lib/hermes/json";
import {
  normalizeSegments,
  segmentsFromDossier,
  type SegmentsPayload,
} from "@/lib/domain/segments";

function segmentPrompt(domain: string, dossier: Dossier | null, goals: string[] = []): string {
  const pack = buildCompanyContextPack({ dossier, domain, salesConfig: null });
  const positioning =
    dossier?.positioning?.trim() ||
    "(positioning missing — use ONLY the company pack; do not invent a vertical)";
  const category = dossier?.product_category?.trim() || "infer from positioning only";
  const goalLine = goals.length ? `Client goals: ${goals.join(", ")}.` : "";

  return `You are Kami's sales strategist for canonical domain: ${domain}.
${goalLine}

CRITICAL — product identity:
- Seller is ONLY ${domain}.
- Product positioning: ${positioning}
- Product category (from evidence): ${category}
- Derive segments for WHO WOULD BUY THIS PRODUCT.
- Use only what the company pack supports; never assume an industry.
- Ignore same-name companies on other domains.

Rules:
- 3–5 DISTINCT segments for THIS product.
- Mark motion "b2b_sales_assisted" OR "plg_self_serve".
- B2B segments MUST include 3–6 real candidate_companies with domains (not listicles, not ${domain}).
- PLG segments use example_user_personas — never invent emails.
- why_fit = why they'd buy THIS product (from positioning), not a generic vertical.

${pack}

Output ONLY a fenced json block:
\`\`\`json
{
  "segments": [
    {
      "name": "...",
      "why_fit": "why they'd buy THIS product",
      "firmographic": "...",
      "technographic": "...",
      "trigger_signal": "...",
      "motion": "b2b_sales_assisted",
      "target_persona": "role to contact",
      "target_count": 5,
      "candidate_companies": [{ "name": "...", "domain": "example.com", "why": "..." }],
      "example_user_personas": []
    }
  ]
}
\`\`\``;
}

export async function deriveSalesSegments(params: {
  domain: string;
  dossier: Dossier | null;
  kamiSessionId?: string | null;
  goals?: string[];
}): Promise<SegmentsPayload> {
  const fallback = segmentsFromDossier(params.dossier, params.domain);

  if (!hermesConfigured()) {
    return {
      segments: fallback,
      source: fallback[0]?.candidate_companies?.length ? "dossier_fallback" : "blank",
      confirmed_at: null,
    };
  }

  const text = await completeOrNull({
    agent: "sales-strategist",
    kind: "sales_segments",
    input: segmentPrompt(params.domain, params.dossier, params.goals ?? []),
    kamiSessionId: params.kamiSessionId,
    timeoutMs: 90_000,
  });

  if (!text) {
    return { segments: fallback, source: "dossier_fallback", confirmed_at: null };
  }

  const parsed = parseLastJsonBlock(text);
  const segments = normalizeSegments(parsed);
  if (segments.length < 1) {
    return { segments: fallback, source: "dossier_fallback", confirmed_at: null };
  }

  return { segments, source: "hermes", confirmed_at: null };
}
