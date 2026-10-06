"use client";

import { useState } from "react";
import DiffTable from "@/components/bui/DiffTable";
import LoadingState from "@/components/bui/LoadingState";
import IntelPanel from "@/components/IntelPanel";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card, { CardBar, CardBody, CardFooter } from "@/components/ui/Card";
import Disclosure from "@/components/ui/Disclosure";
import Field, { Input, Textarea } from "@/components/ui/Field";
import { IconCheck, IconClose, IconEdit, IconPlus, IconRefresh } from "@/components/ui/icons";
import { EntityChip, Monogram, StatusPill, Tag } from "@/components/ui/Pills";
import { api, errorMessage } from "@/lib/client/api";
import type { Dossier, IcpBucket } from "@/lib/domain/dossier";
import { applyDossierDiff, diffDossier } from "@/lib/domain/dossierDiff";

/** Editable customer-group fields, in display order. */
const BUCKET_FIELDS = [
  ["label", "Who they are"],
  ["where_they_live", "Where to find them"],
  ["trigger_signal", "What makes them buy now"],
  ["est_size", "How many"],
  ["angle", "Why they’d care"],
] as const satisfies ReadonlyArray<readonly [keyof IcpBucket, string]>;

interface DossierConfirmProps {
  dossier: Dossier;
  sessionDbId: string | null;
  onConfirm: () => Promise<void>;
  onDossierUpdated: (dossier: Dossier) => void;
  /**
   * `full` (default): the summary plus every section of the dossier.
   * `onboarding`: a calm summary first, with the full dossier behind a disclosure.
   */
  variant?: "full" | "onboarding";
  /** Label of the confirm button (defaults by variant). */
  confirmLabel?: string;
  /**
   * The dossier is already confirmed and saved edits are re-confirmed by the
   * caller (Settings → Company): reads as "Your company", not "Is this you?".
   */
  confirmed?: boolean;
}

type Mode = "view" | "edit" | "correct" | "revising" | "review";

/**
 * "Is this you?" — the founder confirms the dossier before any GTM choice.
 * Edit directly, or describe a correction: Kami proposes a revision and the
 * founder keeps changes row by row in a DiffTable before anything is saved.
 */
export default function DossierConfirm({
  dossier,
  sessionDbId,
  onConfirm,
  onDossierUpdated,
  variant = "full",
  confirmLabel,
  confirmed = false,
}: DossierConfirmProps) {
  const [mode, setMode] = useState<Mode>("view");
  const [draft, setDraft] = useState<Dossier>(() => structuredClone(dossier));
  const [saving, setSaving] = useState(false);
  const [correction, setCorrection] = useState("");
  const [proposed, setProposed] = useState<Dossier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const onboarding = variant === "onboarding";

  function startEdit() {
    setDraft(structuredClone(dossier));
    setMode("edit");
    setError(null);
    setNotice(null);
  }

  function toggleCorrect() {
    setMode((m) => (m === "correct" ? "view" : "correct"));
    setError(null);
    setNotice(null);
  }

  async function save(next: Dossier) {
    if (!sessionDbId) return;
    const { dossier: saved } = await api.put<{ dossier: Dossier }>(
      `/api/sessions/${sessionDbId}/dossier`,
      { dossier: next },
    );
    onDossierUpdated(saved);
  }

  async function saveEdits() {
    setSaving(true);
    setError(null);
    try {
      await save(draft);
      setMode("view");
      setNotice(
        confirmed ? "Changes saved." : "Changes saved. Check the summary, then confirm again.",
      );
    } catch (err) {
      setError(errorMessage(err, "Could not save your changes"));
    } finally {
      setSaving(false);
    }
  }

  async function previewCorrection() {
    if (!sessionDbId || !correction.trim()) return;
    setMode("revising");
    setError(null);
    try {
      const { dossier: revised } = await api.post<{ dossier: Dossier }>(
        `/api/sessions/${sessionDbId}/dossier/revise`,
        { correction: correction.trim(), preview: true },
      );
      setProposed(revised);
      setMode("review");
    } catch (err) {
      setError(errorMessage(err, "Could not revise the summary"));
      setMode("correct");
    }
  }

  async function confirm() {
    setConfirming(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(errorMessage(err, "Could not confirm"));
    } finally {
      setConfirming(false);
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

  const diffRows = proposed ? diffDossier(dossier, proposed) : [];
  const changed = diffRows.filter((r) => r.kind !== "same");
  const busy = mode === "revising";

  // One accent action at a time: "That's us" only while nothing else is open.
  const confirmButton =
    mode === "view" && !confirmed ? (
      <Button
        variant="accent"
        size={onboarding ? "md" : "sm"}
        icon={onboarding ? <IconCheck size={14} strokeWidth={2.4} /> : undefined}
        busy={confirming}
        onClick={() => void confirm()}
      >
        {confirmLabel ?? (onboarding ? "That’s us" : "That’s us — what’s next?")}
      </Button>
    ) : null;

  const secondaryActions = (
    <span className="row dossier-confirm__actions">
      <Button
        size="sm"
        variant={onboarding ? "ghost" : "secondary"}
        icon={<IconEdit size={13} />}
        onClick={startEdit}
        disabled={busy || confirming}
      >
        {onboarding ? "Edit details" : "Edit"}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        icon={<IconRefresh size={13} />}
        aria-expanded={mode === "correct" || mode === "revising" || mode === "review"}
        onClick={toggleCorrect}
        disabled={busy || confirming}
      >
        {onboarding || confirmed ? "Something’s off" : "That’s not quite us"}
      </Button>
    </span>
  );

  const editor = (
    <Card>
      <CardBar
        title={onboarding ? "Edit your company" : "Edit dossier"}
        icon={<IconEdit size={14} />}
      >
        <Button variant="quiet" size="xs" onClick={() => setMode("view")}>
          Cancel
        </Button>
      </CardBar>
      <CardBody roomy className="form-stack">
        <Field label="Company">
          <Input
            value={draft.company}
            onChange={(e) => setDraft({ ...draft, company: e.target.value })}
          />
        </Field>
        <Field
          label="What you do"
          hint="One or two sentences: who it is for and what changes for them."
        >
          <Textarea
            rows={3}
            value={draft.positioning}
            onChange={(e) => setDraft({ ...draft, positioning: e.target.value })}
          />
        </Field>
        <Field label="Brand voice">
          <Textarea
            rows={2}
            value={draft.brand_voice}
            onChange={(e) => setDraft({ ...draft, brand_voice: e.target.value })}
          />
        </Field>
        <Field label="Tone" hint="Comma-separated, e.g. direct, warm, technical">
          <Input
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
        </Field>

        <div className="stack stack--sm">
          <p className="field__label">Alternatives buyers compare you with</p>
          {draft.competitor_analysis.map((c, i) => (
            <div key={i} className="input-row input-row--2">
              <Input
                aria-label={`Alternative ${i + 1} name`}
                value={c.name}
                onChange={(e) => updateCompetitor(i, { name: e.target.value })}
                placeholder="Name"
              />
              <Input
                aria-label={`Alternative ${i + 1}: what they do differently`}
                value={c.insight}
                onChange={(e) => updateCompetitor(i, { insight: e.target.value })}
                placeholder="What they do differently"
              />
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove alternative ${i + 1}`}
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    competitor_analysis: d.competitor_analysis.filter((_, j) => j !== i),
                  }))
                }
              >
                <IconClose size={14} />
              </button>
            </div>
          ))}
          <div>
            <Button
              size="xs"
              variant="quiet"
              icon={<IconPlus size={13} />}
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  competitor_analysis: [...d.competitor_analysis, { name: "", insight: "" }],
                }))
              }
            >
              Add an alternative
            </Button>
          </div>
        </div>

        <div className="stack stack--sm">
          <p className="field__label">Who you sell to first</p>
          {draft.icp_buckets.map((b, i) => (
            <Card key={i} tone="inset">
              <CardBody className="field-grid">
                {BUCKET_FIELDS.map(([field, label]) => (
                  <Field key={field} label={label}>
                    {field === "angle" ? (
                      <Textarea
                        rows={2}
                        value={b[field]}
                        onChange={(e) => updateBucket(i, { [field]: e.target.value })}
                      />
                    ) : (
                      <Input
                        value={b[field]}
                        onChange={(e) => updateBucket(i, { [field]: e.target.value })}
                      />
                    )}
                  </Field>
                ))}
              </CardBody>
            </Card>
          ))}
        </div>
      </CardBody>
      <CardFooter>
        {!confirmed && <span className="text-3 text-xs">Saving asks you to confirm again.</span>}
        <Button
          variant="accent"
          size="sm"
          busy={saving}
          onClick={() => void saveEdits()}
          disabled={!sessionDbId}
        >
          Save changes
        </Button>
      </CardFooter>
    </Card>
  );

  const followUps = (
    <>
      {(mode === "correct" || mode === "revising") && (
        <Card className="fade-up dossier-confirm__panel">
          <CardBody roomy className="form-stack">
            <Field
              label="What did Kami get wrong?"
              hint="Kami suggests changes; you choose which to keep before anything is saved."
            >
              <Textarea
                rows={3}
                value={correction}
                disabled={busy}
                autoFocus
                onChange={(e) => setCorrection(e.target.value)}
                placeholder="e.g. We sell to IT teams at large companies in India, not to shoppers."
              />
            </Field>
            {busy && (
              <div aria-live="polite">
                <LoadingState label="Brand analyst is revising your summary" />
              </div>
            )}
          </CardBody>
          <CardFooter>
            <Button variant="quiet" size="sm" onClick={() => setMode("view")} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="accent"
              size="sm"
              busy={busy}
              disabled={!correction.trim() || !sessionDbId}
              onClick={() => void previewCorrection()}
            >
              Suggest changes
            </Button>
          </CardFooter>
        </Card>
      )}

      {mode === "review" && proposed && (
        <div className="fade-up dossier-confirm__panel">
          {changed.length === 0 ? (
            <Callout
              tone="info"
              title="No changes suggested"
              actions={
                <span className="row">
                  <Button size="sm" variant="secondary" onClick={() => setMode("correct")}>
                    Try a different note
                  </Button>
                  <Button size="sm" variant="quiet" onClick={() => setMode("view")}>
                    Done
                  </Button>
                </span>
              }
            >
              The brand analyst kept the summary as it is for that note.
            </Callout>
          ) : (
            <DiffTable
              title="Suggested changes"
              columns={["Field", "Suggested"]}
              widths={["30%", "70%"]}
              rows={changed.map((r) => ({
                key: r.key,
                kind: r.kind,
                cells: [r.field, r.after || r.before],
                before: r.kind === "changed" ? r.before : undefined,
              }))}
              onApply={async (keys) => {
                await save(applyDossierDiff(dossier, proposed, keys));
                setCorrection("");
                setProposed(null);
                setMode("view");
                setNotice(
                  `${keys.length} ${keys.length === 1 ? "change" : "changes"} saved.${confirmed ? "" : " Check the summary, then confirm again."}`,
                );
              }}
              onCancel={() => {
                setProposed(null);
                setMode("view");
              }}
              applyLabel={(n) => `Keep ${n} ${n === 1 ? "change" : "changes"}`}
              appliedLabel={(n) => `${n} ${n === 1 ? "change" : "changes"} saved`}
            />
          )}
        </div>
      )}

      {notice && mode === "view" && (
        <div className="dossier-confirm__panel" aria-live="polite">
          <Callout tone="success">{notice}</Callout>
        </div>
      )}

      {error && (
        <div className="dossier-confirm__panel">
          <Callout tone="error">{error}</Callout>
        </div>
      )}
    </>
  );

  if (onboarding) {
    const buckets = dossier.icp_buckets.slice(0, 3);
    const alternatives = dossier.competitor_analysis.slice(0, 4).map((c) => c.name);
    const sources = dossier.evidence_urls.length;
    return (
      <div className="dossier-confirm dossier-confirm--onboarding">
        {mode === "edit" ? (
          editor
        ) : (
          <Card className="onb-dossier">
            <CardBody roomy className="onb-dossier__body">
              <div className="onb-dossier__head">
                <Monogram name={dossier.company} shape="square" size="lg" />
                <div className="onb-dossier__name">
                  <h2 className="onb-dossier__company">{dossier.company}</h2>
                  <p className="onb-dossier__domain">
                    {dossier.canonical_domain}
                    {dossier.product_category ? ` · ${dossier.product_category}` : ""}
                  </p>
                </div>
              </div>

              <p className="onb-dossier__positioning">{dossier.positioning}</p>

              <dl className="onb-dossier__facts">
                <div className="onb-dossier__fact">
                  <dt>Who you sell to</dt>
                  <dd>
                    <ul className="onb-dossier__list">
                      {buckets.map((b) => (
                        <li key={b.label}>
                          <span className="onb-dossier__item">{b.label}</span>
                          {b.where_they_live && (
                            <span className="onb-dossier__meta">{b.where_they_live}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </dd>
                </div>
                <div className="onb-dossier__fact">
                  <dt>How you sound</dt>
                  <dd>
                    {dossier.tone.length > 0 ? (
                      <span className="tag-list">
                        {dossier.tone.map((t) => (
                          <Tag key={t}>{t}</Tag>
                        ))}
                      </span>
                    ) : (
                      dossier.brand_voice
                    )}
                  </dd>
                </div>
                {alternatives.length > 0 && (
                  <div className="onb-dossier__fact">
                    <dt>Alternatives</dt>
                    <dd>{alternatives.join(", ")}</dd>
                  </div>
                )}
              </dl>
            </CardBody>
            <CardFooter className="onb-dossier__footer">
              {secondaryActions}
              {confirmButton}
            </CardFooter>
          </Card>
        )}
        {followUps}
        {mode !== "edit" && (
          <div className="onb-dossier__more">
            <Disclosure label="See everything Kami found">
              <IntelPanel dossier={dossier} />
            </Disclosure>
            <p className="onb-dossier__sources">
              Based on {sources} {sources === 1 ? "page" : "pages"} Kami read. You can change any of
              this later in Settings.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <section className="section">
        <div className="section__head">
          <span className="section__num">01</span>
          <h2 className="section__title">{confirmed ? "Your company" : "Is this you?"}</h2>
          <span className="section__desc">
            {confirmed
              ? "What every agent plans from."
              : "Confirm what Kami understood before it plans anything."}
          </span>
        </div>

        {mode === "edit" ? (
          editor
        ) : (
          <Card className="dossier-summary">
            <CardBody roomy>
              <div className="row row--between dossier-confirm__head">
                <div className="stack stack--sm dossier-confirm__title">
                  <h3 className="dossier-summary__company">{dossier.company}</h3>
                  <p className="dossier-summary__positioning">{dossier.positioning}</p>
                </div>
                {confirmed ? (
                  <StatusPill tone="green">Confirmed</StatusPill>
                ) : (
                  <StatusPill tone="orange">Needs your OK</StatusPill>
                )}
              </div>
              <div className="dossier-summary__facts">
                <div>
                  <span className="dossier-summary__label">Voice</span>
                  <span className="text-2">{dossier.brand_voice}</span>
                </div>
                {dossier.tone?.length > 0 && (
                  <div>
                    <span className="dossier-summary__label">Tone</span>
                    <span className="tag-list">
                      {dossier.tone.map((t) => (
                        <Tag key={t}>{t}</Tag>
                      ))}
                    </span>
                  </div>
                )}
                {dossier.icp_buckets?.[0] && (
                  <div>
                    <span className="dossier-summary__label">First customers</span>
                    <span>
                      {dossier.icp_buckets.slice(0, 3).map((b) => (
                        <EntityChip key={b.label} name={b.label} />
                      ))}
                    </span>
                  </div>
                )}
              </div>
            </CardBody>
            <CardFooter>
              {secondaryActions}
              {confirmButton}
            </CardFooter>
          </Card>
        )}

        {followUps}
      </section>

      <section className="section">
        <div className="section__head">
          <span className="section__num">02</span>
          <h2 className="section__title">Intelligence</h2>
          <span className="section__desc">Everything in the dossier, grouped.</span>
        </div>
        <IntelPanel dossier={mode === "edit" ? draft : dossier} />
      </section>
    </>
  );
}
