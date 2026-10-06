"use client";

import { useState } from "react";
import AgentWait from "@/components/sales/AgentWait";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card, { CardBar, CardBody, CardFooter } from "@/components/ui/Card";
import Disclosure from "@/components/ui/Disclosure";
import EmptyState from "@/components/ui/EmptyState";
import Field, { Input, Select, Textarea } from "@/components/ui/Field";
import {
  IconBuilding,
  IconClose,
  IconPlus,
  IconRefresh,
  IconUser,
  IconUsers,
} from "@/components/ui/icons";
import { Monogram, StatusPill } from "@/components/ui/Pills";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type { CandidateCompany, SalesSegment } from "@/lib/domain/segments";
import { validateSegmentsForConfirm } from "@/lib/salesSegmentGates";

interface SegmentConfirmProps {
  sessionDbId: string;
  onConfirmed: (segments: SalesSegment[]) => void;
  /** editing already-confirmed segments: show a way back without saving */
  onCancel?: () => void;
}

const DRAFT_STAGES = [
  "Reading your company profile",
  "Using a saved draft if there is one",
  "Sorting buyers into groups",
  "Suggesting real companies to start with",
];

/** The confirm rule (lib/salesSegmentGates), worded for the founder. */
function confirmError(segments: SalesSegment[]): string | null {
  const err = validateSegmentsForConfirm(segments);
  if (!err) return null;
  const bad = segments.find((s) => validateSegmentsForConfirm([s]));
  if (!bad) return err;
  return bad.motion === "plg_self_serve"
    ? `Add at least one example user to “${bad.name}”.`
    : `Add at least one real company, with its domain, to “${bad.name}”.`;
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
export default function SegmentConfirm({
  sessionDbId,
  onConfirmed,
  onCancel,
}: SegmentConfirmProps) {
  const { data, error, loading, reload } = useApi<SegmentsResponse>(
    withQuery("/api/sales/segments", { session_id: sessionDbId }),
  );

  if (loading && !data) {
    return (
      <AgentWait
        agent="sales-strategist"
        doing="is drafting who you sell to"
        stages={DRAFT_STAGES}
        stepMs={2200}
      />
    );
  }
  if (error || !data) {
    return (
      <Callout
        tone="error"
        title="Could not load who you sell to"
        actions={
          <Button size="sm" variant="secondary" onClick={reload}>
            Try again
          </Button>
        }
      >
        {error ?? "Nothing came back."}
      </Callout>
    );
  }
  return (
    <SegmentEditor
      key={`${data.source}-${data.confirmed_at ?? "draft"}`}
      sessionDbId={sessionDbId}
      initial={data}
      onConfirmed={onConfirmed}
      onCancel={onCancel}
    />
  );
}

function SegmentEditor({
  sessionDbId,
  initial,
  onConfirmed,
  onCancel,
}: SegmentConfirmProps & { initial: SegmentsResponse }) {
  const [segments, setSegments] = useState<SalesSegment[]>(() =>
    seedPlgPersonas(initial.segments ?? []),
  );
  const [busy, setBusy] = useState(false);
  const [busyMode, setBusyMode] = useState<"refresh" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    const validationError = confirmError(seeded);
    if (validationError) {
      setError(validationError);
      requestAnimationFrame(() =>
        document
          .getElementById("segments-error")
          ?.scrollIntoView({ block: "center", behavior: "smooth" }),
      );
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
      onConfirmed(json.segments ?? seeded);
    } catch (err) {
      setError(errorMessage(err, "Could not save who you sell to"));
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
    } catch (err) {
      setError(errorMessage(err, "Could not redraft who you sell to"));
    } finally {
      setBusy(false);
      setBusyMode(null);
    }
  }

  const redrafting = busy && busyMode === "refresh";

  return (
    <div className="segments">
      {redrafting && (
        <AgentWait
          agent="sales-strategist"
          doing="is redrafting who you sell to"
          stages={DRAFT_STAGES}
          stepMs={2400}
        />
      )}

      {!segments.length && !busy && (
        <EmptyState
          title="No customer groups yet"
          icon={<IconUsers size={16} />}
          action={
            <Button
              size="sm"
              variant="secondary"
              icon={<IconRefresh size={13} />}
              onClick={rederive}
            >
              Draft from my company profile
            </Button>
          }
        >
          Kami drafts who to sell to from the company profile you confirmed.
        </EmptyState>
      )}

      <div className="stack stack--lg">
        {segments.map((seg, i) => (
          <Card key={seg.key} as="section" aria-label={seg.name || `Group ${i + 1}`}>
            <CardBar
              title={seg.name || `Group ${i + 1}`}
              icon={<Monogram name={seg.name || "S"} shape="square" />}
            >
              <StatusPill tone={seg.motion === "plg_self_serve" ? "accent" : "neutral"} dot={false}>
                {seg.motion === "plg_self_serve" ? "Individual users" : "Companies to email"}
              </StatusPill>
              <button
                type="button"
                className="icon-btn icon-btn--sm"
                aria-label={`Remove ${seg.name || `group ${i + 1}`}`}
                title="Remove"
                onClick={() => removeSegment(i)}
              >
                <IconClose size={13} />
              </button>
            </CardBar>
            <CardBody roomy className="form-stack">
              <div className="field-grid">
                <Field label="Name">
                  <Input
                    value={seg.name}
                    onChange={(e) => updateSegment(i, { name: e.target.value })}
                  />
                </Field>
                <Field label="How to reach them">
                  <Select
                    value={seg.motion}
                    onChange={(e) => setMotion(i, e.target.value as SalesSegment["motion"])}
                  >
                    <option value="b2b_sales_assisted">Email the company</option>
                    <option value="plg_self_serve">They sign up on their own</option>
                  </Select>
                </Field>
              </div>
              <Field label="Why they’d buy">
                <Textarea
                  rows={2}
                  value={seg.why_fit}
                  onChange={(e) => updateSegment(i, { why_fit: e.target.value })}
                />
              </Field>
              <Field label="Who to contact">
                <Input
                  value={seg.target_persona}
                  onChange={(e) => updateSegment(i, { target_persona: e.target.value })}
                />
              </Field>

              {seg.motion === "b2b_sales_assisted" && (
                <div className="stack stack--sm">
                  <div>
                    <p className="field__label">Companies to start with</p>
                    <p className="field__hint">
                      Real companies with their website. Kami checks each one before drafting.
                    </p>
                  </div>
                  {(seg.candidate_companies ?? []).map((c, ci) => (
                    <div key={`${seg.key}-c-${ci}`} className="input-row">
                      <Input
                        aria-label="Company"
                        placeholder="Company"
                        value={c.name}
                        onChange={(e) => updateCandidate(i, ci, { name: e.target.value })}
                      />
                      <Input
                        aria-label="Website domain"
                        placeholder="domain.com"
                        value={c.domain}
                        onChange={(e) => updateCandidate(i, ci, { domain: e.target.value })}
                      />
                      <Input
                        aria-label="Why they fit"
                        placeholder="Why they fit"
                        value={c.why ?? ""}
                        onChange={(e) => updateCandidate(i, ci, { why: e.target.value })}
                      />
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Remove ${c.name || "company"}`}
                        onClick={() => removeCandidate(i, ci)}
                      >
                        <IconClose size={14} />
                      </button>
                    </div>
                  ))}
                  <div>
                    <Button
                      size="xs"
                      variant="quiet"
                      icon={<IconBuilding size={13} />}
                      onClick={() => addCandidate(i)}
                    >
                      Add company
                    </Button>
                  </div>
                </div>
              )}

              {seg.motion === "plg_self_serve" && (
                <div className="stack stack--sm">
                  <div>
                    <p className="field__label">Example users</p>
                    <p className="field__hint">
                      Who would try this on their own? A short description is enough. Kami reaches
                      these people through distribution, never with guessed emails.
                    </p>
                  </div>
                  {(seg.example_user_personas ?? []).map((p, pi) => (
                    <div key={`${seg.key}-p-${pi}`} className="input-row input-row--2">
                      <Input
                        aria-label="Example user"
                        placeholder="e.g. Indie hacker with 40 Chrome extensions"
                        value={p.label}
                        onChange={(e) => updatePersona(i, pi, { label: e.target.value })}
                      />
                      <Input
                        aria-label="Why they’d try it"
                        placeholder="Why they’d try it"
                        value={p.why_fit}
                        onChange={(e) => updatePersona(i, pi, { why_fit: e.target.value })}
                      />
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Remove example user"
                        onClick={() => removePersona(i, pi)}
                      >
                        <IconClose size={14} />
                      </button>
                    </div>
                  ))}
                  <div>
                    <Button
                      size="xs"
                      variant="quiet"
                      icon={<IconUser size={13} />}
                      onClick={() => addPersona(i)}
                    >
                      Add example user
                    </Button>
                  </div>
                </div>
              )}

              <Disclosure label="More detail">
                <div className="field-grid">
                  <Field label="Companies to research" hint="1–20">
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={seg.target_count}
                      onChange={(e) =>
                        updateSegment(i, { target_count: Number(e.target.value) || 1 })
                      }
                    />
                  </Field>
                  <Field label="Buying signal" optional>
                    <Input
                      value={seg.trigger_signal}
                      onChange={(e) => updateSegment(i, { trigger_signal: e.target.value })}
                      placeholder="e.g. posting about broken extensions"
                    />
                  </Field>
                </div>
              </Disclosure>
            </CardBody>
          </Card>
        ))}
      </div>

      {error && (
        <div id="segments-error" className="segments__error">
          <Callout tone="error">{error}</Callout>
        </div>
      )}

      <Card tone="flat" className="sticky-actions">
        <CardFooter plain>
          <span className="row">
            {onCancel && (
              <Button size="sm" variant="quiet" onClick={onCancel} disabled={busy}>
                Cancel
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              icon={<IconPlus size={13} />}
              onClick={addSegment}
              disabled={busy}
            >
              Add a group
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<IconRefresh size={13} />}
              onClick={rederive}
              disabled={busy}
            >
              Redraft
            </Button>
          </span>
          <Button
            variant="accent"
            onClick={confirm}
            busy={busy && busyMode === "confirm"}
            disabled={busy || !segments.length}
          >
            {onCancel ? "Save and redo the plan" : "Confirm who you sell to"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
