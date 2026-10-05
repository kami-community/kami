import type { Dossier } from "@/lib/hermes";
import { buildCompanyContextPack } from "@/lib/guideContext";
import { hermesChatOnce, hermesGatewayConfigured, parseLastJsonBlock } from "@/lib/hermesServer";

export type SegmentMotion = "b2b_sales_assisted" | "plg_self_serve";

export interface CandidateCompany {
  name: string;
  domain: string;
  why?: string;
}

export interface ExampleUserPersona {
  label: string;
  why_fit: string;
  personalization_hook?: string;
}

export interface SalesSegment {
  key: string;
  name: string;
  why_fit: string;
  firmographic: string;
  technographic: string;
  trigger_signal: string;
  motion: SegmentMotion;
  target_persona: string;
  target_count: number;
  candidate_companies: CandidateCompany[];
  example_user_personas: ExampleUserPersona[];
}

export interface SegmentsPayload {
  segments: SalesSegment[];
  source: "hermes" | "dossier_fallback" | "blank";
  confirmed_at?: string | null;
}

function slugKey(name: string, index: number): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return base || `segment-${index + 1}`;
}

function normalizeMotion(raw: unknown): SegmentMotion {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("plg") || s.includes("self")) return "plg_self_serve";
  return "b2b_sales_assisted";
}

function normalizeCompany(raw: unknown): CandidateCompany | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name.trim() : "";
  let domain =
    typeof o.domain === "string"
      ? o.domain
          .trim()
          .toLowerCase()
          .replace(/^www\./, "")
      : "";
  if (!name && !domain) return null;
  if (!domain && name.includes(".")) domain = name.toLowerCase().replace(/^www\./, "");
  if (!domain) return null;
  return {
    name: name || domain.split(".")[0],
    domain,
    why: typeof o.why === "string" ? o.why : undefined,
  };
}

function normalizePersona(raw: unknown): ExampleUserPersona | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const label = typeof o.label === "string" ? o.label.trim() : "";
  const why = typeof o.why_fit === "string" ? o.why_fit.trim() : "";
  if (!label) return null;
  return {
    label,
    why_fit: why || "Individual practitioner who could adopt the product",
    personalization_hook:
      typeof o.personalization_hook === "string" ? o.personalization_hook : undefined,
  };
}

export function normalizeSegments(raw: unknown): SalesSegment[] {
  if (!raw || typeof raw !== "object") return [];
  const root = raw as Record<string, unknown>;
  const list = Array.isArray(root.segments) ? root.segments : Array.isArray(raw) ? raw : [];
  const out: SalesSegment[] = [];

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) continue;

    const companies = (Array.isArray(o.candidate_companies) ? o.candidate_companies : [])
      .map(normalizeCompany)
      .filter((c): c is CandidateCompany => Boolean(c));
    const personas = (Array.isArray(o.example_user_personas) ? o.example_user_personas : [])
      .map(normalizePersona)
      .filter((p): p is ExampleUserPersona => Boolean(p));

    const motion = normalizeMotion(o.motion);
    out.push({
      key: typeof o.key === "string" && o.key.trim() ? o.key.trim() : slugKey(name, i),
      name,
      why_fit: typeof o.why_fit === "string" ? o.why_fit : "See segment rationale",
      firmographic: typeof o.firmographic === "string" ? o.firmographic : "",
      technographic: typeof o.technographic === "string" ? o.technographic : "",
      trigger_signal: typeof o.trigger_signal === "string" ? o.trigger_signal : "",
      motion,
      target_persona:
        typeof o.target_persona === "string"
          ? o.target_persona
          : typeof o.title === "string"
            ? o.title
            : "Decision-maker",
      target_count: Math.max(1, Math.min(20, Number(o.target_count) || 5)),
      candidate_companies: companies,
      example_user_personas: personas,
    });
  }

  return out.slice(0, 5);
}

/** Map dossier ICP buckets — never inject scheduling/Calendly defaults. */
export function segmentsFromDossier(dossier: Dossier | null, domain: string): SalesSegment[] {
  const company = dossier?.company ?? domain;
  const buckets = dossier?.icp_buckets ?? [];
  const positioning = dossier?.positioning?.trim() ?? "";

  if (!buckets.length) {
    // Blank editable seed — not a fake vertical
    return [
      {
        key: "primary-buyers",
        name: `Buyers for ${company}`,
        why_fit: positioning
          ? `Would buy based on: ${positioning.slice(0, 200)}`
          : "Add why this segment would buy — grounded in the Overview dossier",
        firmographic: dossier?.industries?.join(", ") || "",
        technographic: dossier?.product_category || "",
        trigger_signal: "",
        motion: "b2b_sales_assisted",
        target_persona: dossier?.personas?.[0] || "Decision-maker",
        target_count: 5,
        candidate_companies: [],
        example_user_personas: [],
      },
    ];
  }

  return buckets.slice(0, 5).map((b, i) => {
    const isPlg = /individual|freelancer|creator|self-serve|consumer|b2c/i.test(
      `${b.label} ${b.est_size}`,
    );
    return {
      key: slugKey(b.label, i),
      name: b.label,
      why_fit:
        b.angle || `Would buy ${company} when ${b.trigger_signal || "a relevant trigger appears"}`,
      firmographic: b.est_size,
      technographic: b.where_they_live,
      trigger_signal: b.trigger_signal,
      motion: (isPlg ? "plg_self_serve" : "b2b_sales_assisted") as SegmentMotion,
      target_persona: isPlg ? "Individual user" : b.label,
      target_count: 5,
      candidate_companies: [],
      example_user_personas: isPlg
        ? [
            {
              label: `Example ${b.label} user`,
              why_fit: b.angle,
              personalization_hook: b.trigger_signal,
            },
          ]
        : [],
    };
  });
}

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
- Never invent healthcare, biotech, scheduling, Calendly, or booking narratives unless the pack explicitly supports them.
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
  hermesSessionId?: string;
  kamiSessionId?: string | null;
  goals?: string[];
}): Promise<SegmentsPayload> {
  const fallback = segmentsFromDossier(params.dossier, params.domain);

  if (!hermesGatewayConfigured()) {
    return {
      segments: fallback,
      source: fallback[0]?.candidate_companies?.length ? "dossier_fallback" : "blank",
      confirmed_at: null,
    };
  }

  const text = await hermesChatOnce({
    content: segmentPrompt(params.domain, params.dossier, params.goals ?? []),
    sessionId: params.hermesSessionId ?? `kami-segments-${params.domain}`,
    kamiSessionId: params.kamiSessionId,
    kind: "sales_segments",
    agent: "icp_segmentation",
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

export function icpFromSegments(segments: SalesSegment[]): {
  titles: string[];
  industries: string[];
} {
  const titles = [
    ...new Set(
      segments
        .map((s) => s.target_persona)
        .flatMap((t) => t.split(/[,/]/).map((x) => x.trim()))
        .filter(Boolean),
    ),
  ].slice(0, 6);

  const industries = [
    ...new Set(
      segments
        .flatMap((s) => [s.name, ...s.firmographic.split(/[,;]/)])
        .map((s) => s.trim())
        .filter((s) => s.length > 2 && s.length < 40),
    ),
  ].slice(0, 6);

  return {
    titles: titles.length ? titles : [],
    industries: industries.length ? industries : [],
  };
}

// Re-export for server callers; client UI must import from salesSegmentGates
export { validateSegmentsForConfirm } from "@/lib/salesSegmentGates";
