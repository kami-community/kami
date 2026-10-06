"use client";

import { api, errorMessage } from "@/lib/client/api";
import { useState } from "react";
import type { Dossier, IcpBucket } from "@/lib/domain/dossier";
import IntelPanel from "@/components/IntelPanel";
import Callout from "@/components/ui/Callout";

/** Editable ICP bucket fields, in display order. */
const BUCKET_FIELDS = [
  ["label", "Label"],
  ["where_they_live", "Where they live"],
  ["trigger_signal", "Trigger signal"],
  ["est_size", "Size"],
  ["angle", "Angle"],
] as const satisfies ReadonlyArray<readonly [keyof IcpBucket, string]>;

interface DossierConfirmProps {
  dossier: Dossier;
  sessionDbId: string | null;
  onConfirm: () => Promise<void>;
  onDossierUpdated: (dossier: Dossier) => void;
}

function cloneDossier(d: Dossier): Dossier {
  return structuredClone(d);
}

export default function DossierConfirm({
  dossier,
  sessionDbId,
  onConfirm,
  onDossierUpdated,
}: DossierConfirmProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Dossier>(() => cloneDossier(dossier));
  const [saving, setSaving] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [correction, setCorrection] = useState("");
  const [revising, setRevising] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  function startEdit() {
    setDraft(cloneDossier(dossier));
    setEditing(true);
    setError(null);
  }

  async function saveEdits() {
    if (!sessionDbId) return;
    setSaving(true);
    setError(null);
    try {
      const { dossier: saved } = await api.put<{ dossier: Dossier }>(
        `/api/sessions/${sessionDbId}/dossier`,
        { dossier: draft },
      );
      onDossierUpdated(saved);
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err, "Could not save the dossier"));
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    if (!sessionDbId || !correction.trim()) return;
    setRevising(true);
    setError(null);
    try {
      const { dossier: revised } = await api.post<{ dossier: Dossier }>(
        `/api/sessions/${sessionDbId}/dossier/revise`,
        { correction: correction.trim() },
      );
      onDossierUpdated(revised);
      setDraft(revised);
      setShowRegenerate(false);
      setCorrection("");
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err, "Could not regenerate the dossier"));
    } finally {
      setRevising(false);
    }
  }

  function updateBucket(i: number, patch: Partial<IcpBucket>) {
    setDraft((d) => {
      const buckets = [...d.icp_buckets];
      buckets[i] = { ...buckets[i], ...patch };
      return { ...d, icp_buckets: buckets };
    });
  }

  function updateCompetitor(i: number, patch: { name?: string; insight?: string }) {
    setDraft((d) => {
      const comps = [...d.competitor_analysis];
      comps[i] = { ...comps[i], ...patch };
      return { ...d, competitor_analysis: comps };
    });
  }

  const view = editing ? draft : dossier;

  return (
    <div className="dossier-confirm flow-md">
      <div className="section-head">
        <p className="label-caps">Confirm what Kami understood</p>
        {!editing ? (
          <button type="button" className="btn-outline mono" onClick={startEdit}>
            Edit
          </button>
        ) : (
          <div className="actions">
            <button
              type="button"
              className="link-button mono"
              onClick={() => {
                setEditing(false);
                setDraft(cloneDossier(dossier));
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void saveEdits()}
              disabled={saving || !sessionDbId}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>

      <div className="kraft-card">
        {editing ? (
          <div className="form-stack">
            <div className="form-line">
              <label className="mono label-caps" htmlFor="dossier-company">
                Company
              </label>
              <input
                id="dossier-company"
                value={draft.company}
                onChange={(e) => setDraft({ ...draft, company: e.target.value })}
              />
            </div>
            <div className="form-line">
              <label className="mono label-caps" htmlFor="dossier-positioning">
                Positioning
              </label>
              <textarea
                id="dossier-positioning"
                className="sales-textarea"
                rows={3}
                value={draft.positioning}
                onChange={(e) => setDraft({ ...draft, positioning: e.target.value })}
              />
            </div>
            <div className="form-line">
              <label className="mono label-caps" htmlFor="dossier-voice">
                Brand voice
              </label>
              <textarea
                id="dossier-voice"
                className="sales-textarea"
                rows={2}
                value={draft.brand_voice}
                onChange={(e) => setDraft({ ...draft, brand_voice: e.target.value })}
              />
            </div>
            <div className="form-line">
              <label className="mono label-caps" htmlFor="dossier-tone">
                Tone (comma-separated)
              </label>
              <input
                id="dossier-tone"
                value={(draft.tone ?? []).join(", ")}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    tone: e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>

            <p className="label-caps">Competitors</p>
            {draft.competitor_analysis.map((c, i) => (
              <div key={i} className="input-pair">
                <div className="form-line">
                  <input
                    aria-label={`Competitor ${i + 1} name`}
                    value={c.name}
                    onChange={(e) => updateCompetitor(i, { name: e.target.value })}
                    placeholder="Name"
                  />
                </div>
                <div className="form-line">
                  <input
                    aria-label={`Competitor ${i + 1} insight`}
                    value={c.insight}
                    onChange={(e) => updateCompetitor(i, { insight: e.target.value })}
                    placeholder="Insight"
                  />
                </div>
              </div>
            ))}

            <p className="label-caps">ICP buckets / first customers</p>
            {draft.icp_buckets.map((b, i) => (
              <div key={i} className="subcard form-stack">
                {BUCKET_FIELDS.map(([field, label]) => (
                  <div key={field} className="form-line">
                    <label className="mono label-caps" htmlFor={`bucket-${i}-${field}`}>
                      {label}
                    </label>
                    {field === "angle" ? (
                      <textarea
                        id={`bucket-${i}-${field}`}
                        className="sales-textarea"
                        rows={2}
                        value={b[field]}
                        onChange={(e) => updateBucket(i, { [field]: e.target.value })}
                      />
                    ) : (
                      <input
                        id={`bucket-${i}-${field}`}
                        value={b[field]}
                        onChange={(e) => updateBucket(i, { [field]: e.target.value })}
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="flow">
            <h3>{view.company}</h3>
            <p>{view.positioning}</p>
            <p className="mono meta-line">Voice: {view.brand_voice}</p>
            {view.icp_buckets?.[0] && (
              <p>
                Suggested first customers: <strong>{view.icp_buckets[0].label}</strong>
              </p>
            )}
          </div>
        )}
      </div>

      <div className="actions">
        <button
          type="button"
          className="hanko-btn"
          disabled={editing || confirming}
          onClick={async () => {
            setConfirming(true);
            setError(null);
            try {
              await onConfirm();
            } catch (err) {
              setError(errorMessage(err, "Could not confirm the dossier"));
            } finally {
              setConfirming(false);
            }
          }}
        >
          {confirming ? "Saving…" : "That’s us — what’s next?"}
        </button>
        <button
          type="button"
          className="btn-outline mono"
          aria-expanded={showRegenerate}
          onClick={() => {
            setShowRegenerate((v) => !v);
            setError(null);
          }}
        >
          Regenerate
        </button>
      </div>

      {showRegenerate && (
        <div className="kraft-card unfold form-stack">
          <label className="label-caps" htmlFor="dossier-correction">
            What did we misunderstand?
          </label>
          <textarea
            id="dossier-correction"
            className="sales-textarea"
            rows={3}
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            placeholder="e.g. We sell to enterprise IT buyers in India, not consumers shopping sneakers."
          />
          <div className="actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void regenerate()}
              disabled={revising || !correction.trim() || !sessionDbId}
            >
              {revising ? "Rewriting…" : "Apply correction"}
            </button>
            <button
              type="button"
              className="link-button mono"
              onClick={() => setShowRegenerate(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <Callout tone="error">{error}</Callout>}

      <IntelPanel dossier={view} defaultAllOpen />
    </div>
  );
}
