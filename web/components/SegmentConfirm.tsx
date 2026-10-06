"use client";

import { useState } from "react";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type { CandidateCompany, SalesSegment } from "@/lib/domain/segments";
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

interface SegmentsResponse {
  segments: SalesSegment[];
  source: string;
  confirmed_at: string | null;
}

/** Loads the stored (or freshly drafted) segments, then hands them to the editor. */
export default function SegmentConfirm({ sessionDbId, onConfirmed }: SegmentConfirmProps) {
  const { data, error, loading, reload } = useApi<SegmentsResponse>(
    withQuery("/api/sales/segments", { session_id: sessionDbId }),
  );

  if (loading && !data) {
    return (
      <div className="sales-panel segment-confirm">
        <SalesBusyOverlay
          title="Loading saved ICP"
          stages={["Loading campaign…", "Using saved draft ICP if available…"]}
          detail="Loading saved ICP — Hermes only runs if no draft exists yet."
        />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="sales-panel segment-confirm">
        <p className="form-error" role="alert">
          {error ?? "Could not load segments"}
        </p>
        <button type="button" className="btn-outline" onClick={reload}>
          Try again
        </button>
      </div>
    );
  }
  return (
    <SegmentEditor
      key={`${data.source}-${data.confirmed_at ?? "draft"}`}
      sessionDbId={sessionDbId}
      initial={data}
      onConfirmed={onConfirmed}
    />
  );
}

function SegmentEditor({
  sessionDbId,
  initial,
  onConfirmed,
}: SegmentConfirmProps & { initial: SegmentsResponse }) {
  const [segments, setSegments] = useState<SalesSegment[]>(() =>
    seedPlgPersonas(initial.segments ?? []),
  );
  const [source, setSource] = useState<string>(initial.source ?? "");
  const [busy, setBusy] = useState(false);
  const [busyMode, setBusyMode] = useState<"refresh" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(initial.confirmed_at ?? null);

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
      const json = await api.post<SegmentsResponse>("/api/sales/segments", {
        session_id: sessionDbId,
        action: "confirm",
        segments: seeded,
      });
      setConfirmedAt(json.confirmed_at);
      onConfirmed(json.segments ?? seeded);
    } catch (err) {
      setError(errorMessage(err, "Could not confirm segments"));
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
      const json = await api.post<SegmentsResponse>("/api/sales/segments", {
        session_id: sessionDbId,
        action: "derive",
      });
      setSegments(seedPlgPersonas(json.segments ?? []));
      setSource(json.source ?? "");
      setConfirmedAt(null);
    } catch (err) {
      setError(errorMessage(err, "Could not re-derive segments"));
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
        : "Working…";

  const busyStages =
    busyMode === "refresh"
      ? [
          "Reading Overview dossier…",
          "Hermes drafting buyer segments…",
          "Checking PLG vs B2B motions…",
        ]
      : ["Validating…", "Persisting confirmed ICP…"];

  const busyDetail =
    busyMode === "refresh"
      ? "Deriving ICP segments with Hermes…"
      : busyMode === "confirm"
        ? "Saving your confirmed ICP…"
        : null;

  return (
    <div className="sales-panel segment-confirm-panel">
      {busy && <SalesBusyOverlay title={busyTitle} stages={busyStages} detail={busyDetail} />}

      <h3>Confirm who you&apos;re selling to</h3>
      <p className="sales-intro">
        Edit anything that looks wrong. B2B needs seed company domains for Find. PLG needs an
        example user (who would try the product themselves — not a company email list).
      </p>

      {source && (
        <p className="mono fine-print segment-confirm-panel__source">
          Source: {source}
          {confirmedAt
            ? ` · confirmed ${new Date(confirmedAt).toLocaleString()}`
            : " · not confirmed yet"}
        </p>
      )}

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {!segments.length && !busy && (
        <p className="mono muted segment-confirm-panel__empty">
          No segments yet — click Refresh from dossier.
        </p>
      )}

      <div className="sales-segment-list">
        {segments.map((seg, i) => (
          <section key={seg.key} className="sales-segment">
            <div className="sales-segment-head">
              <div className="form-line sales-segment-head__name">
                <label className="mono label-caps" htmlFor={`seg-name-${seg.key}`}>
                  Segment {i + 1}
                </label>
                <input
                  id={`seg-name-${seg.key}`}
                  value={seg.name}
                  onChange={(e) => updateSegment(i, { name: e.target.value })}
                />
              </div>
              <div className="form-line sales-segment-head__motion">
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
                className="btn-outline segment-remove"
                onClick={() => removeSegment(i)}
              >
                Remove
              </button>
            </div>

            <div className="form-line sales-segment__field">
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
              <div className="form-line sales-segment__budget">
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
              <div className="sales-segment__group">
                <p className="label-caps">Seed companies</p>
                <p className="mono fine-print">
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
                      className="btn-outline"
                      onClick={() => removeCandidate(i, ci)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-outline segment-add"
                  onClick={() => addCandidate(i)}
                >
                  + Add company
                </button>
              </div>
            )}

            {seg.motion === "plg_self_serve" && (
              <div className="sales-segment__group">
                <p className="label-caps">Example users</p>
                <p className="mono fine-print">
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
                      className="btn-outline"
                      onClick={() => removePersona(i, pi)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-outline segment-add"
                  onClick={() => addPersona(i)}
                >
                  + Add example user
                </button>
              </div>
            )}
          </section>
        ))}
      </div>

      <div className="actions segment-confirm-panel__actions">
        <button type="button" className="btn-outline" onClick={addSegment} disabled={busy}>
          + Add segment
        </button>
        <button type="button" className="btn-outline" onClick={rederive} disabled={busy}>
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
