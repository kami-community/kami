"use client";

import Button from "@/components/ui/Button";
import Card, { CardBar, CardBody, CardFooter } from "@/components/ui/Card";
import { IconEdit, IconSettings, IconUsers } from "@/components/ui/icons";
import { Monogram } from "@/components/ui/Pills";
import type { SalesSegmentSummary } from "@/lib/salesTypes";

/** Confirmed "Who you sell to", folded to one card with a way to edit it. */
export default function WhoSummary({
  segments,
  onEdit,
  onEditSettings,
}: {
  segments: SalesSegmentSummary[];
  onEdit: () => void;
  onEditSettings: () => void;
}) {
  return (
    <Card as="section" aria-label="Who you sell to" className="sales-who">
      <CardBar title="Who you sell to" icon={<IconUsers size={13} />}>
        <Button size="xs" variant="quiet" icon={<IconEdit size={12} />} onClick={onEdit}>
          Edit
        </Button>
      </CardBar>
      <CardBody>
        {segments.length ? (
          <ul className="sales-who__list">
            {segments.map((s) => (
              <li key={s.key} className="sales-who__item">
                <Monogram name={s.name || "S"} shape="square" />
                <span className="sales-who__name truncate">{s.name}</span>
                <span className="sales-who__meta truncate">
                  {s.motion === "plg_self_serve" ? "Individual users" : s.target_persona}
                  {s.motion !== "plg_self_serve" && s.target_count
                    ? ` · about ${s.target_count} companies`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-3 text-sm">Confirmed. Open Edit to see the groups.</p>
        )}
      </CardBody>
      <CardFooter plain>
        <Button
          size="xs"
          variant="quiet"
          icon={<IconSettings size={12} />}
          onClick={onEditSettings}
        >
          Edit sending settings
        </Button>
      </CardFooter>
    </Card>
  );
}
