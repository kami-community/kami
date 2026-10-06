"use client";

import { useId, useState } from "react";
import type { Dossier } from "@/lib/domain/dossier";

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section className="intel-section">
      <button
        type="button"
        className="intel-section__toggle label-caps"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(!open)}
      >
        {title}
        <span className="intel-section__mark" aria-hidden="true">
          {open ? "−" : "+"}
        </span>
      </button>
      {open && (
        <div id={bodyId} className="intel-section__body unfold">
          {children}
        </div>
      )}
    </section>
  );
}

interface IntelPanelProps {
  dossier: Dossier;
  /** When true, open every section (confirm overview). */
  defaultAllOpen?: boolean;
}

/** The dossier, folded into sections the founder can open. */
export default function IntelPanel({ dossier, defaultAllOpen = false }: IntelPanelProps) {
  return (
    <aside className="intel-panel">
      <p className="label-caps">Intelligence — {dossier.company}</p>

      <Section title="Brand Analysis" defaultOpen>
        <p>{dossier.brand_voice}</p>
      </Section>

      <Section title="Positioning" defaultOpen={defaultAllOpen}>
        <p>{dossier.positioning}</p>
      </Section>

      {dossier.tone && dossier.tone.length > 0 && (
        <Section title="Tone" defaultOpen={defaultAllOpen}>
          <div className="chip-row">
            {dossier.tone.map((t) => (
              <span key={t} className="tag">
                {t}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title="Competitors" defaultOpen={defaultAllOpen}>
        {dossier.competitor_analysis.map((c) => (
          <p key={c.name}>
            <strong>{c.name}</strong> — {c.insight}
          </p>
        ))}
      </Section>

      <Section title={`ICP Buckets (${dossier.icp_buckets.length})`} defaultOpen>
        {dossier.icp_buckets.map((b) => (
          <details key={b.label} className="intel-bucket">
            <summary>{b.label}</summary>
            <dl className="intel-bucket__facts mono">
              <dt>Where</dt>
              <dd>{b.where_they_live}</dd>
              <dt>Signal</dt>
              <dd>{b.trigger_signal}</dd>
              <dt>Size</dt>
              <dd>{b.est_size}</dd>
            </dl>
            <p>{b.angle}</p>
          </details>
        ))}
      </Section>
    </aside>
  );
}
