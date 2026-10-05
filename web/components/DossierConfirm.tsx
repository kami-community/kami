"use client";

import { useState } from "react";
import type { Dossier, IcpBucket } from "@/lib/hermes";
import IntelPanel from "@/components/IntelPanel";

interface DossierConfirmProps {
  dossier: Dossier;
  sessionDbId: string | null;
  onConfirm: () => void;
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
      const res = await fetch(`/api/sessions/${sessionDbId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "dossier", payload: draft }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not save dossier");
        return;
      }
      onDossierUpdated(draft);
      setEditing(false);
    } catch {
      setError("Network error while saving");
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    if (!sessionDbId || !correction.trim()) return;
    setRevising(true);
    setError(null);
    try {
      const res = await fetch("/api/dossier/revise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionDbId,
          correction: correction.trim(),
          dossier,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.dossier) {
        setError(json.error ?? "Could not regenerate dossier");
        return;
      }
      onDossierUpdated(json.dossier as Dossier);
      setDraft(json.dossier as Dossier);
      setShowRegenerate(false);
      setCorrection("");
      setEditing(false);
    } catch {
      setError("Network error while regenerating");
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
    <div style={{ marginTop: "var(--stack-md)", width: "100%" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: "var(--stack-sm)",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <p className="label-caps">Confirm what Kami understood</p>
        {!editing ? (
          <button
            type="button"
            className="mono"
            onClick={startEdit}
            style={{
              border: "1px solid var(--ink)",
              background: "transparent",
              padding: "0.3rem 0.7rem",
              cursor: "pointer",
            }}
          >
            Edit
          </button>
        ) : (
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="mono"
              onClick={() => {
                setEditing(false);
                setDraft(cloneDossier(dossier));
              }}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--ink-soft)",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="hanko-btn"
              onClick={() => void saveEdits()}
              disabled={saving || !sessionDbId}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        )}
      </div>

      <div
        className="kraft-card"
        style={{ padding: "var(--stack-md)", marginBottom: "var(--stack-md)" }}
      >
        {editing ? (
          <>
            <div className="form-line" style={{ marginBottom: "var(--stack-sm)" }}>
              <label className="mono label-caps" htmlFor="dossier-company">
                Company
              </label>
              <input
                id="dossier-company"
                value={draft.company}
                onChange={(e) => setDraft({ ...draft, company: e.target.value })}
              />
            </div>
            <div className="form-line" style={{ marginBottom: "var(--stack-sm)" }}>
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
            <div className="form-line" style={{ marginBottom: "var(--stack-sm)" }}>
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
            <div className="form-line" style={{ marginBottom: "var(--stack-sm)" }}>
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

            <p className="label-caps" style={{ marginBottom: "0.5rem" }}>
              Competitors
            </p>
            {draft.competitor_analysis.map((c, i) => (
              <div
                key={i}
                style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}
              >
                <input
                  style={{ flex: "1 1 140px" }}
                  value={c.name}
                  onChange={(e) => updateCompetitor(i, { name: e.target.value })}
                  placeholder="Name"
                />
                <input
                  style={{ flex: "2 1 220px" }}
                  value={c.insight}
                  onChange={(e) => updateCompetitor(i, { insight: e.target.value })}
                  placeholder="Insight"
                />
              </div>
            ))}

            <p className="label-caps" style={{ margin: "var(--stack-sm) 0 0.5rem" }}>
              ICP buckets / first customers
            </p>
            {draft.icp_buckets.map((b, i) => (
              <div
                key={i}
                style={{
                  border: "1px solid var(--outline)",
                  padding: "0.75rem",
                  marginBottom: "0.5rem",
                }}
              >
                <div className="form-line" style={{ marginBottom: "0.4rem" }}>
                  <label className="mono label-caps">Label</label>
                  <input
                    value={b.label}
                    onChange={(e) => updateBucket(i, { label: e.target.value })}
                  />
                </div>
                <div className="form-line" style={{ marginBottom: "0.4rem" }}>
                  <label className="mono label-caps">Where they live</label>
                  <input
                    value={b.where_they_live}
                    onChange={(e) => updateBucket(i, { where_they_live: e.target.value })}
                  />
                </div>
                <div className="form-line" style={{ marginBottom: "0.4rem" }}>
                  <label className="mono label-caps">Trigger signal</label>
                  <input
                    value={b.trigger_signal}
                    onChange={(e) => updateBucket(i, { trigger_signal: e.target.value })}
                  />
                </div>
                <div className="form-line" style={{ marginBottom: "0.4rem" }}>
                  <label className="mono label-caps">Size</label>
                  <input
                    value={b.est_size}
                    onChange={(e) => updateBucket(i, { est_size: e.target.value })}
                  />
                </div>
                <div className="form-line">
                  <label className="mono label-caps">Angle</label>
                  <textarea
                    className="sales-textarea"
                    rows={2}
                    value={b.angle}
                    onChange={(e) => updateBucket(i, { angle: e.target.value })}
                  />
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            <h3 style={{ marginBottom: "0.5rem" }}>{view.company}</h3>
            <p style={{ marginBottom: "0.75rem" }}>{view.positioning}</p>
            <p className="mono" style={{ fontSize: 13, color: "var(--ink-soft)" }}>
              Voice: {view.brand_voice}
            </p>
            {view.icp_buckets?.[0] && (
              <p style={{ marginTop: "0.75rem" }}>
                Suggested first customers: <strong>{view.icp_buckets[0].label}</strong>
              </p>
            )}
          </>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginBottom: "var(--stack-md)",
        }}
      >
        <button type="button" className="hanko-btn" onClick={onConfirm} disabled={editing}>
          That&apos;s us — what&apos;s next?
        </button>
        <button
          type="button"
          className="mono"
          onClick={() => {
            setShowRegenerate((v) => !v);
            setError(null);
          }}
          style={{
            border: "1px solid var(--ink)",
            background: "transparent",
            padding: "0.4rem 0.75rem",
            cursor: "pointer",
          }}
        >
          Regenerate
        </button>
      </div>

      {showRegenerate && (
        <div
          className="kraft-card"
          style={{ padding: "var(--stack-md)", marginBottom: "var(--stack-md)" }}
        >
          <p className="label-caps" style={{ marginBottom: "0.5rem" }}>
            What did we misunderstand?
          </p>
          <textarea
            className="sales-textarea"
            rows={3}
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            placeholder="e.g. We sell to enterprise IT buyers in India, not consumers shopping sneakers."
          />
          <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="hanko-btn"
              onClick={() => void regenerate()}
              disabled={revising || !correction.trim() || !sessionDbId}
            >
              {revising ? "Rewriting…" : "Apply correction"}
            </button>
            <button
              type="button"
              className="mono"
              onClick={() => setShowRegenerate(false)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--ink-soft)",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p
          className="mono"
          style={{ color: "var(--hanko)", fontSize: 13, marginBottom: "var(--stack-sm)" }}
        >
          {error}
        </p>
      )}

      <div style={{ marginTop: "var(--stack-md)" }}>
        <IntelPanel dossier={view} defaultAllOpen />
      </div>
    </div>
  );
}
