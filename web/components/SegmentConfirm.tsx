"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { CandidateCompany, SalesSegment } from "@/lib/salesSegments";
import { validateSegmentsForConfirm } from "@/lib/salesSegmentGates";
import SalesBusyOverlay from "@/components/SalesBusyOverlay";

interface SegmentConfirmProps {
  sessionDbId: string;
  onConfirmed: (segments: SalesSegment[]) => void;
}

/** Ensure PLG segments have at least one editable example-user row. */
function seedPlgPersonas(segments: SalesSegment[]): SalesSegment[] {
  return segments.map((s) => {
    if (s.motion !== "plg_self_serve") return s;
    if (s.example_user_personas?.some((p) => p.label?.trim())) return s;
    const seed = (s.target_persona || "Example user").split(",")[0]?.trim() || "Example user";
    return {
      ...s,
      example_user_personas: [
        {
          label: seed,
          why_fit: s.why_fit?.slice(0, 160) || "Would try this product on their own",
          personalization_hook: s.trigger_signal || undefined,
        },
      ],
    };
  });
}

const ghostBtn: CSSProperties = {
  border: "1px solid var(--ink)",
  background: "transparent",
  padding: "0.4rem 0.75rem",
  cursor: "pointer",
  fontSize: 12,
};

export default function SegmentConfirm({ sessionDbId, onConfirmed }: SegmentConfirmProps) {
  const [segments, setSegments] = useState<SalesSegment[]>([]);
  const [source, setSource] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [busyMode, setBusyMode] = useState<"load" | "refresh" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setBusyMode("load");
    setError(null);
    try {
      const res = await fetch(`/api/sales/segments?session_id=${sessionDbId}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not load segments");
        return;
      }
      setSegments(seedPlgPersonas(json.segments ?? []));
      setSource(json.source ?? "");
      setConfirmedAt(json.confirmed_at ?? null);
    } finally {
      setBusy(false);
      setBusyMode(null);
    }
  }, [sessionDbId]);

  useEffect(() => {
    load();
  }, [load]);

  function updateSegment(index: number, patch: Partial<SalesSegment>) {
    setSegments((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function updateCandidate(segIndex: number, candIndex: number, patch: Partial<CandidateCompany>) {
    setSegments((prev) =>
      prev.map((s, i) => {
        if (i !== segIndex) return s;
        const companies = [...(s.candidate_companies ?? [])];
        companies[candIndex] = { ...companies[candIndex], ...patch };
        return { ...s, candidate_companies: companies };
      }),
    );
  }

  function addCandidate(segIndex: number) {
    setSegments((prev) =>
      prev.map((s, i) =>
        i === segIndex
          ? {
              ...s,
              candidate_companies: [
                ...(s.candidate_companies ?? []),
                { name: "", domain: "", why: "" },
              ],
            }
          : s,
      ),
    );
  }

  function removeCandidate(segIndex: number, candIndex: number) {
    setSegments((prev) =>
      prev.map((s, i) =>
        i === segIndex
          ? {
              ...s,
              candidate_companies: (s.candidate_companies ?? []).filter((_, j) => j !== candIndex),
            }
          : s,
      ),
    );
  }

  function updatePersona(
    segIndex: number,
    personaIndex: number,
    patch: Partial<{ label: string; why_fit: string; personalization_hook: string }>,
  ) {
    setSegments((prev) =>
      prev.map((s, i) => {
        if (i !== segIndex) return s;
        const personas = [...(s.example_user_personas ?? [])];
        personas[personaIndex] = { ...personas[personaIndex], ...patch };
        return { ...s, example_user_personas: personas };
      }),
    );
  }

  function addPersona(segIndex: number) {
    setSegments((prev) =>
      prev.map((s, i) => {
        if (i !== segIndex) return s;
        const seed = (s.target_persona || "Example user").split(",")[0]?.trim() || "Example user";
        return {
          ...s,
          example_user_personas: [
            ...(s.example_user_personas ?? []),
            {
              label: seed,
              why_fit: s.why_fit?.slice(0, 160) || "Would try this product on their own",
              personalization_hook: s.trigger_signal || undefined,
            },
          ],
        };
      }),
    );
  }

  function removePersona(segIndex: number, personaIndex: number) {
    setSegments((prev) =>
      prev.map((s, i) =>
        i === segIndex
          ? {
              ...s,
              example_user_personas: (s.example_user_personas ?? []).filter(
                (_, j) => j !== personaIndex,
              ),
            }
          : s,
      ),
    );
  }

  function setMotion(index: number, motion: SalesSegment["motion"]) {
    setSegments((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        if (
          motion === "plg_self_serve" &&
          (!s.example_user_personas || s.example_user_personas.length < 1)
        ) {
          const seed = (s.target_persona || "Example user").split(",")[0]?.trim() || "Example user";
          return {
            ...s,
            motion,
            example_user_personas: [
              {
                label: seed,
                why_fit: s.why_fit?.slice(0, 160) || "Would try this product on their own",
                personalization_hook: s.trigger_signal || undefined,
              },
            ],
          };
        }
        return { ...s, motion };
      }),
    );
  }

  function removeSegment(index: number) {
    setSegments((prev) => prev.filter((_, i) => i !== index));
  }

  function addSegment() {
    setSegments((prev) => [
      ...prev,
      {
        key: `custom-${Date.now()}`,
        name: "New segment",
        why_fit: "Why they'd buy this product — grounded in Overview research",
        firmographic: "",
        technographic: "",
        trigger_signal: "",
        motion: "b2b_sales_assisted",
        target_persona: "Decision-maker",
        target_count: 5,
        candidate_companies: [{ name: "", domain: "", why: "" }],
        example_user_personas: [],
      },
    ]);
  }

  async function confirm() {
    const seeded = seedPlgPersonas(segments);
    setSegments(seeded);
    const validationError = validateSegmentsForConfirm(seeded);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setBusyMode("confirm");
    setError(null);
    try {
      const res = await fetch("/api/sales/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionDbId, action: "confirm", segments: seeded }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not confirm segments");
        return;
      }
      setConfirmedAt(json.confirmed_at);
      onConfirmed(json.segments ?? seeded);
    } finally {
      setBusy(false);
      setBusyMode(null);
    }
  }

  async function rederive() {
    setBusy(true);
    setBusyMode("refresh");
    setError(null);
    try {
      const res = await fetch("/api/sales/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionDbId, action: "derive" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not re-derive segments");
        return;
      }
      setSegments(seedPlgPersonas(json.segments ?? []));
      setSource(json.source ?? "");
      setConfirmedAt(null);
    } finally {
      setBusy(false);
      setBusyMode(null);
    }
  }

  const busyTitle =
    busyMode === "refresh"
      ? "Asking Hermes for segments"
      : busyMode === "confirm"
        ? "Saving ICP confirmation"
        : busyMode === "load"
          ? "Loading saved ICP"
          : "Working…";

  const busyStages =
    busyMode === "refresh"
      ? [
          "Reading Overview dossier…",
          "Hermes drafting buyer segments…",
          "Checking PLG vs B2B motions…",
        ]
      : busyMode === "load"
        ? ["Loading campaign…", "Using saved draft ICP if available…"]
        : ["Validating…", "Persisting confirmed ICP…"];

  const busyDetail =
    busyMode === "load"
      ? "Loading saved ICP — Hermes only runs if no draft exists yet."
      : busyMode === "refresh"
        ? "Deriving ICP segments with Hermes…"
        : busyMode === "confirm"
          ? "Saving your confirmed ICP…"
          : null;

  return (
    <div className="sales-panel" style={{ position: "relative", paddingTop: "var(--stack-md)" }}>
      {busy && <SalesBusyOverlay title={busyTitle} stages={busyStages} detail={busyDetail} />}

      <h3 style={{ marginBottom: "var(--stack-sm)" }}>Confirm who you&apos;re selling to</h3>
      <p className="sales-intro">
        Edit anything that looks wrong. B2B needs seed company domains for Find. PLG needs an
        example user (who would try the product themselves — not a company email list).
      </p>

      {source && (
        <p
          className="mono"
          style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: "var(--stack-md)" }}
        >
          Source: {source}
          {confirmedAt
            ? ` · confirmed ${new Date(confirmedAt).toLocaleString()}`
            : " · not confirmed yet"}
        </p>
      )}

      {error && (
        <p
          className="mono"
          style={{ color: "var(--hanko)", fontSize: 13, marginBottom: "var(--stack-md)" }}
        >
          {error}
        </p>
      )}

      {!segments.length && !busy && (
        <p
          className="mono"
          style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: "var(--stack-md)" }}
        >
          No segments yet — click Refresh from dossier.
        </p>
      )}

      <div className="sales-segment-list">
        {segments.map((seg, i) => (
          <section key={seg.key} className="sales-segment">
            <div className="sales-segment-head">
              <div className="form-line" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
                <label className="mono label-caps" htmlFor={`seg-name-${seg.key}`}>
                  Segment {i + 1}
                </label>
                <input
                  id={`seg-name-${seg.key}`}
                  value={seg.name}
                  onChange={(e) => updateSegment(i, { name: e.target.value })}
                />
              </div>
              <div className="form-line" style={{ width: 200, marginBottom: 0 }}>
                <label className="mono label-caps" htmlFor={`seg-motion-${seg.key}`}>
                  Motion
                </label>
                <select
                  id={`seg-motion-${seg.key}`}
                  value={seg.motion}
                  onChange={(e) => setMotion(i, e.target.value as SalesSegment["motion"])}
                  className="sales-select"
                >
                  <option value="b2b_sales_assisted">B2B — email companies</option>
                  <option value="plg_self_serve">PLG — individual users</option>
                </select>
              </div>
              <button
                type="button"
                className="mono"
                onClick={() => removeSegment(i)}
                style={{ ...ghostBtn, alignSelf: "flex-end" }}
              >
                Remove
              </button>
            </div>

            <div className="form-line" style={{ marginTop: "var(--stack-sm)" }}>
              <label className="mono label-caps" htmlFor={`seg-why-${seg.key}`}>
                Why they&apos;d buy
              </label>
              <textarea
                id={`seg-why-${seg.key}`}
                className="sales-textarea"
                rows={2}
                value={seg.why_fit}
                onChange={(e) => updateSegment(i, { why_fit: e.target.value })}
              />
            </div>

            <div className="sales-segment-grid">
              <div className="form-line">
                <label className="mono label-caps" htmlFor={`seg-who-${seg.key}`}>
                  Who to contact
                </label>
                <input
                  id={`seg-who-${seg.key}`}
                  value={seg.target_persona}
                  onChange={(e) => updateSegment(i, { target_persona: e.target.value })}
                />
              </div>
              <div className="form-line" style={{ maxWidth: 100 }}>
                <label className="mono label-caps" htmlFor={`seg-budget-${seg.key}`}>
                  Budget
                </label>
                <input
                  id={`seg-budget-${seg.key}`}
                  type="number"
                  min={1}
                  max={20}
                  value={seg.target_count}
                  onChange={(e) => updateSegment(i, { target_count: Number(e.target.value) || 1 })}
                />
              </div>
              <div className="form-line">
                <label className="mono label-caps" htmlFor={`seg-trigger-${seg.key}`}>
                  Trigger signal
                </label>
                <input
                  id={`seg-trigger-${seg.key}`}
                  value={seg.trigger_signal}
                  onChange={(e) => updateSegment(i, { trigger_signal: e.target.value })}
                  placeholder="e.g. posting about broken extensions"
                />
              </div>
            </div>

            {seg.motion === "b2b_sales_assisted" && (
              <div style={{ marginTop: "var(--stack-sm)" }}>
                <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
                  Seed companies
                </p>
                <p
                  className="mono"
                  style={{
                    fontSize: 12,
                    color: "var(--ink-soft)",
                    marginBottom: "var(--stack-sm)",
                  }}
                >
                  Real domains Kami will verify in Find. Required for B2B.
                </p>
                {(seg.candidate_companies ?? []).map((c, ci) => (
                  <div key={`${seg.key}-c-${ci}`} className="sales-segment-row">
                    <input
                      placeholder="Company"
                      value={c.name}
                      onChange={(e) => updateCandidate(i, ci, { name: e.target.value })}
                    />
                    <input
                      placeholder="domain.com"
                      value={c.domain}
                      onChange={(e) => updateCandidate(i, ci, { domain: e.target.value })}
                    />
                    <input
                      placeholder="Why they fit"
                      value={c.why ?? ""}
                      onChange={(e) => updateCandidate(i, ci, { why: e.target.value })}
                    />
                    <button
                      type="button"
                      className="mono"
                      onClick={() => removeCandidate(i, ci)}
                      style={ghostBtn}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="mono"
                  onClick={() => addCandidate(i)}
                  style={{ ...ghostBtn, marginTop: "0.5rem" }}
                >
                  + Add company
                </button>
              </div>
            )}

            {seg.motion === "plg_self_serve" && (
              <div style={{ marginTop: "var(--stack-sm)" }}>
                <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
                  Example users
                </p>
                <p
                  className="mono"
                  style={{
                    fontSize: 12,
                    color: "var(--ink-soft)",
                    marginBottom: "var(--stack-sm)",
                  }}
                >
                  Who would try this themselves? One short description is enough — not a company,
                  not an email.
                </p>
                {(seg.example_user_personas ?? []).map((p, pi) => (
                  <div
                    key={`${seg.key}-p-${pi}`}
                    className="sales-segment-row sales-segment-row--persona"
                  >
                    <input
                      placeholder="e.g. Indie hacker with 40 Chrome extensions"
                      value={p.label}
                      onChange={(e) => updatePersona(i, pi, { label: e.target.value })}
                    />
                    <input
                      placeholder="Why they'd try it"
                      value={p.why_fit}
                      onChange={(e) => updatePersona(i, pi, { why_fit: e.target.value })}
                    />
                    <button
                      type="button"
                      className="mono"
                      onClick={() => removePersona(i, pi)}
                      style={ghostBtn}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="mono"
                  onClick={() => addPersona(i)}
                  style={{ ...ghostBtn, marginTop: "0.5rem" }}
                >
                  + Add example user
                </button>
              </div>
            )}
          </section>
        ))}
      </div>

      <div
        style={{
          display: "flex",
          gap: "var(--stack-sm)",
          marginTop: "var(--stack-lg)",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          className="mono"
          onClick={addSegment}
          disabled={busy}
          style={ghostBtn}
        >
          + Add segment
        </button>
        <button type="button" className="mono" onClick={rederive} disabled={busy} style={ghostBtn}>
          Refresh from dossier
        </button>
        <button
          type="button"
          className="hanko-btn"
          onClick={confirm}
          disabled={busy || !segments.length}
        >
          {busy && busyMode === "confirm" ? "Saving…" : "Confirm segments"}
        </button>
      </div>
    </div>
  );
}
