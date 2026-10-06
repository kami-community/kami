"use client";

import type { ReactNode } from "react";

/**
 * Page-level tabs for an area (Find customers · Distribution · Team …).
 * Each tab is a real link to its URL; plain clicks navigate client-side.
 * Tabs marked `advanced` sit after a divider.
 */
export interface AreaTab<K extends string> {
  key: K;
  label: string;
  href: string;
  count?: number;
  advanced?: boolean;
  /** shown, but explains why it is not useful yet */
  hint?: string;
  icon?: ReactNode;
}

export default function AreaTabs<K extends string>({
  label,
  tabs,
  active,
  onSelect,
}: {
  label: string;
  tabs: AreaTab<K>[];
  active: K;
  onSelect: (key: K) => void;
}) {
  const firstAdvanced = tabs.findIndex((t) => t.advanced);
  return (
    <nav className="area-tabs" aria-label={label}>
      {tabs.map((tab, i) => (
        <span key={tab.key} className="area-tabs__slot">
          {i === firstAdvanced && i > 0 && (
            <span className="area-tabs__divider" aria-hidden>
              Advanced
            </span>
          )}
          <a
            href={tab.href}
            aria-current={tab.key === active ? "page" : undefined}
            title={tab.hint}
            className={`area-tabs__tab${tab.key === active ? " is-active" : ""}`}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
              event.preventDefault();
              onSelect(tab.key);
            }}
          >
            {tab.icon}
            {tab.label}
            {tab.count ? <span className="area-tabs__count">{tab.count}</span> : null}
          </a>
        </span>
      ))}
    </nav>
  );
}
