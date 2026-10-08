"use client";

import { useState } from "react";
import Card, { CardBar, CardBody } from "@/components/ui/Card";
import Segmented from "@/components/ui/Segmented";
import { IconCompass, IconLines, IconUsers } from "@/components/ui/icons";
import { Monogram, Tag } from "@/components/ui/Pills";
import type { Dossier } from "@/lib/domain/dossier";

type Tab = "brand" | "icp" | "competitors";

/** The dossier as tabbed cards: brand, customers (ICP buckets), competitors. */
export default function IntelPanel({ dossier }: { dossier: Dossier }) {
  const [tab, setTab] = useState<Tab>("brand");

  return (
    <div className="intel">
      <Segmented<Tab>
        label="Dossier section"
        value={tab}
        onChange={setTab}
        options={[
          { value: "brand", label: "Brand" },
          { value: "icp", label: "Customers", count: dossier.icp_buckets.length },
          { value: "competitors", label: "Competitors", count: dossier.competitor_analysis.length },
        ]}
      />

      {tab === "brand" && (
        <div className="grid-2 fade-up">
          <Card>
            <CardBar title="Positioning" icon={<IconCompass size={13} />} />
            <CardBody className="intel__prose">{dossier.positioning}</CardBody>
          </Card>
          <Card>
            <CardBar title="Brand voice" icon={<IconLines size={13} />} />
            <CardBody className="stack stack--sm">
              <p className="intel__prose">{dossier.brand_voice}</p>
              {dossier.tone?.length > 0 && (
                <div className="tag-list">
                  {dossier.tone.map((t) => (
                    <Tag key={t}>{t}</Tag>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
          {(dossier.industries.length > 0 ||
            dossier.personas.length > 0 ||
            dossier.geos.length > 0) && (
            <Card className="intel__wide">
              <CardBar title="Market" icon={<IconUsers size={13} />} />
              <CardBody className="intel__facts">
                {[
                  ["Industries", dossier.industries],
                  ["Personas", dossier.personas],
                  ["Geographies", dossier.geos],
                ].map(([label, items]) =>
                  (items as string[]).length ? (
                    <div key={label as string} className="intel__fact">
                      <span className="intel__fact-label">{label as string}</span>
                      <span className="tag-list">
                        {(items as string[]).map((i) => (
                          <Tag key={i}>{i}</Tag>
                        ))}
                      </span>
                    </div>
                  ) : null,
                )}
              </CardBody>
            </Card>
          )}
        </div>
      )}

      {tab === "icp" && (
        <div className="grid-2 fade-up">
          {dossier.icp_buckets.map((b) => (
            <Card key={b.label}>
              <CardBar title={b.label} icon={<Monogram name={b.label} shape="square" />}>
                {b.est_size && <span className="card__meta">{b.est_size}</span>}
              </CardBar>
              <CardBody className="stack stack--sm">
                {b.angle && <p className="intel__prose">{b.angle}</p>}
                <dl className="intel__dl">
                  {b.where_they_live && (
                    <>
                      <dt>Where</dt>
                      <dd>{b.where_they_live}</dd>
                    </>
                  )}
                  {b.trigger_signal && (
                    <>
                      <dt>Signal</dt>
                      <dd>{b.trigger_signal}</dd>
                    </>
                  )}
                </dl>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {tab === "competitors" && (
        <Card className="fade-up">
          {dossier.competitor_analysis.length === 0 ? (
            <CardBody className="text-3 text-sm">No competitors identified yet.</CardBody>
          ) : (
            <ul className="intel__list">
              {dossier.competitor_analysis.map((c) => (
                <li key={c.name} className="intel__competitor">
                  <Monogram name={c.name} shape="square" size="lg" />
                  <div>
                    <p className="intel__competitor-name">{c.name}</p>
                    <p className="intel__prose">{c.insight}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
