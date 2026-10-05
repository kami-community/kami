"use client";

import { useState } from "react";
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
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="label-caps"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "0.5rem 0",
          width: "100%",
          textAlign: "left",
          display: "flex",
          justifyContent: "space-between",
          color: "var(--ink)",
        }}
      >
        {title}
        <span style={{ color: "var(--hanko)" }}>{open ? "−" : "+"}</span>
      </button>
      {open && <div style={{ paddingBottom: "var(--stack-sm)" }}>{children}</div>}
      <hr className="crease" style={{ margin: "0.25rem 0" }} />
    </div>
  );
}

interface IntelPanelProps {
  dossier: Dossier;
  /** When true, open every section (confirm overview). */
  defaultAllOpen?: boolean;
}

export default function IntelPanel({ dossier, defaultAllOpen = false }: IntelPanelProps) {
  return (
    <aside>
      <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
        Intelligence — {dossier.company}
      </p>

      <Section title="Brand Analysis" defaultOpen>
        <p style={{ fontSize: 14 }}>{dossier.brand_voice}</p>
      </Section>

      <Section title="Positioning" defaultOpen={defaultAllOpen}>
        <p style={{ fontSize: 14 }}>{dossier.positioning}</p>
      </Section>

      {dossier.tone && dossier.tone.length > 0 && (
        <Section title="Tone" defaultOpen={defaultAllOpen}>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {dossier.tone.map((t) => (
              <span
                key={t}
                className="mono"
                style={{ border: "1px solid var(--crease)", padding: "0.15rem 0.5rem" }}
              >
                {t}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title="Competitors" defaultOpen={defaultAllOpen}>
        {dossier.competitor_analysis.map((c) => (
          <p key={c.name} style={{ fontSize: 14, marginBottom: "0.5rem" }}>
            <strong>{c.name}</strong> — {c.insight}
          </p>
        ))}
      </Section>

      <Section title={`ICP Buckets (${dossier.icp_buckets.length})`} defaultOpen>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack-sm)" }}>
          {dossier.icp_buckets.map((b) => (
            <details key={b.label} style={{ border: "1px solid var(--crease)", padding: "0.5rem" }}>
              <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
                {b.label}
              </summary>
              <div style={{ marginTop: "0.5rem", fontSize: 13 }}>
                <p className="mono">WHERE · {b.where_they_live}</p>
                <p className="mono">SIGNAL · {b.trigger_signal}</p>
                <p className="mono">SIZE · {b.est_size}</p>
                <p style={{ marginTop: "0.4rem" }}>{b.angle}</p>
              </div>
            </details>
          ))}
        </div>
      </Section>
    </aside>
  );
}
