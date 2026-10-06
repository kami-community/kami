import type { Competitor, Dossier, IcpBucket } from "./dossier";

/**
 * Field-level diff between the stored dossier and a proposed revision, so the
 * founder can keep some changes and drop others. Browser-safe and pure.
 */

export type DossierDiffKind = "changed" | "added" | "removed" | "same";

export interface DossierDiffRow {
  key: string;
  kind: DossierDiffKind;
  field: string;
  before: string;
  after: string;
}

const SCALARS = [
  ["company", "Company"],
  ["positioning", "Positioning"],
  ["brand_voice", "Brand voice"],
  ["product_category", "Category"],
] as const;

const LISTS = [
  ["tone", "Tone"],
  ["industries", "Industries"],
  ["personas", "Personas"],
  ["geos", "Geographies"],
] as const;

const bucketText = (b: IcpBucket) =>
  [
    b.where_they_live && `Where: ${b.where_they_live}`,
    b.trigger_signal && `Signal: ${b.trigger_signal}`,
    b.angle,
  ]
    .filter(Boolean)
    .join(" · ");

const norm = (s: string) => s.trim().toLowerCase();

function keyed<T>(items: T[], key: (t: T) => string): Map<string, T> {
  return new Map(items.map((t) => [norm(key(t)), t]));
}

export function diffDossier(current: Dossier, proposed: Dossier): DossierDiffRow[] {
  const rows: DossierDiffRow[] = [];

  for (const [k, field] of SCALARS) {
    const before = String(current[k] ?? "");
    const after = String(proposed[k] ?? "");
    rows.push({
      key: k,
      field,
      before,
      after,
      kind: before === after ? "same" : before ? (after ? "changed" : "removed") : "added",
    });
  }
  for (const [k, field] of LISTS) {
    const before = (current[k] ?? []).join(", ");
    const after = (proposed[k] ?? []).join(", ");
    if (!before && !after) continue;
    rows.push({
      key: k,
      field,
      before,
      after,
      kind: before === after ? "same" : before ? (after ? "changed" : "removed") : "added",
    });
  }

  const pairs = <T>(
    prefix: string,
    label: string,
    a: T[],
    b: T[],
    name: (t: T) => string,
    body: (t: T) => string,
  ) => {
    const before = keyed(a, name);
    const after = keyed(b, name);
    for (const [k, item] of before) {
      const next = after.get(k);
      if (!next)
        rows.push({
          key: `${prefix}:${k}`,
          kind: "removed",
          field: `${label}: ${name(item)}`,
          before: body(item),
          after: body(item),
        });
      else {
        const same = body(item) === body(next);
        rows.push({
          key: `${prefix}:${k}`,
          kind: same ? "same" : "changed",
          field: `${label}: ${name(next)}`,
          before: body(item),
          after: body(next),
        });
      }
    }
    for (const [k, item] of after) {
      if (!before.has(k))
        rows.push({
          key: `${prefix}:${k}`,
          kind: "added",
          field: `${label}: ${name(item)}`,
          before: "",
          after: body(item),
        });
    }
  };

  pairs<Competitor>(
    "competitor",
    "Competitor",
    current.competitor_analysis,
    proposed.competitor_analysis,
    (c) => c.name,
    (c) => c.insight,
  );
  pairs<IcpBucket>(
    "icp",
    "ICP",
    current.icp_buckets,
    proposed.icp_buckets,
    (b) => b.label,
    bucketText,
  );
  return rows;
}

/** The current dossier with only the kept changes from `proposed` applied. */
export function applyDossierDiff(
  current: Dossier,
  proposed: Dossier,
  kept: Iterable<string>,
): Dossier {
  const keep = new Set(kept);
  const next: Dossier = structuredClone(current);
  const writable = next as unknown as Record<string, unknown>;
  for (const [k] of SCALARS) if (keep.has(k)) writable[k] = proposed[k];
  for (const [k] of LISTS) if (keep.has(k)) writable[k] = [...(proposed[k] ?? [])];

  const merge = <T>(prefix: string, a: T[], b: T[], name: (t: T) => string): T[] => {
    const after = keyed(b, name);
    const out: T[] = [];
    for (const item of a) {
      const k = norm(name(item));
      const kept = keep.has(`${prefix}:${k}`);
      const next = after.get(k);
      if (!next) {
        if (!kept) out.push(item); // removal not kept
      } else out.push(kept ? next : item);
    }
    const before = keyed(a, name);
    for (const item of b) {
      const k = norm(name(item));
      if (!before.has(k) && keep.has(`${prefix}:${k}`)) out.push(item);
    }
    return out;
  };

  next.competitor_analysis = merge(
    "competitor",
    current.competitor_analysis,
    proposed.competitor_analysis,
    (c) => c.name,
  );
  next.icp_buckets = merge("icp", current.icp_buckets, proposed.icp_buckets, (b) => b.label);
  return next;
}
