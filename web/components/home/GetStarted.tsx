"use client";

import { IconCheck, IconChevronRight } from "@/components/ui/icons";
import { Section } from "@/components/ui/Page";
import type { ChecklistItem } from "@/lib/client/nextStep";
import ViewLink from "./ViewLink";

/** Home → get-started checklist, shown until the first send or post. */
export default function GetStarted({ items }: { items: ChecklistItem[] }) {
  const done = items.filter((i) => i.done).length;
  return (
    <Section title="Get started" desc={`${done} of ${items.length} done`}>
      <div
        className="home-progress"
        role="progressbar"
        aria-label="Get started"
        aria-valuemin={0}
        aria-valuemax={items.length}
        aria-valuenow={done}
      >
        {items.map((i) => (
          <span key={i.key} className={`home-progress__seg${i.done ? " is-done" : ""}`} />
        ))}
      </div>
      <ol className="card home-checklist">
        {items.map((item) => (
          <li key={item.key}>
            <ViewLink
              view={item.view}
              className={`home-checklist__row${item.done ? " is-done" : ""}`}
            >
              <span className="home-checklist__mark" aria-hidden>
                {item.done && <IconCheck size={11} strokeWidth={3} />}
              </span>
              <span className="home-checklist__label">
                {item.label}
                {item.done && <span className="sr-only"> (done)</span>}
              </span>
              <IconChevronRight size={13} className="home-checklist__chevron" />
            </ViewLink>
          </li>
        ))}
      </ol>
    </Section>
  );
}
