"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import GlideMenu from "@/components/bui/GlideMenu";
import { Kbd } from "@/components/ui/Pills";
import { IconClose, IconSearch } from "@/components/ui/icons";

/* ─────────────────────────────────────────────────────────
 * SEARCH — command search with live filtering, as a ⌘K palette.
 * The field, clear action, and results are directly usable;
 * ↑/↓ move, ⏎ runs, Esc closes.
 * ───────────────────────────────────────────────────────── */

export type Command = {
  id: string;
  label: string;
  group?: string;
  hint?: string;
  icon?: ReactNode;
  keywords?: string;
  run: () => void;
};

export default function CommandPalette({
  open,
  onClose,
  commands,
  placeholder = "Search Kami…",
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  placeholder?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      `${c.label} ${c.group ?? ""} ${c.keywords ?? ""}`.toLowerCase().includes(q),
    );
  }, [commands, query]);
  const empty = query.length > 0 && results.length === 0;
  const active = Math.min(cursor, Math.max(0, results.length - 1));

  function close() {
    setQuery("");
    setCursor(0);
    onClose();
  }

  function run(command: Command) {
    close();
    command.run();
  }

  return (
    <dialog
      ref={ref}
      className="palette"
      aria-label="Command search"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className="palette__box">
        <div className="palette__input-row">
          <IconSearch size={14} style={{ color: "var(--ink-3)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((c) => Math.min(c + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (event.key === "Enter" && results[active]) {
                event.preventDefault();
                run(results[active]);
              }
            }}
            placeholder={placeholder}
            aria-label="Search commands"
            aria-controls="palette-results"
            aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
            className="palette__input"
          />
          {query ? (
            <button
              aria-label="Clear search"
              type="button"
              onClick={() => setQuery("")}
              className="palette__clear"
            >
              <IconClose size={11} strokeWidth={2.2} />
            </button>
          ) : (
            <Kbd>esc</Kbd>
          )}
        </div>

        {empty ? (
          <div className="palette__empty">
            <span className="palette__empty-icon">
              <IconSearch size={15} strokeWidth={1.8} />
            </span>
            <span className="palette__empty-title">No results found</span>
            <span className="palette__empty-hint">Adjust your search to try again</span>
          </div>
        ) : (
          <div className="palette__results" id="palette-results" role="listbox">
            <GlideMenu className="palette__list" highlightClassName="glide__highlight--sm">
              {results.map((item, i) => {
                const header =
                  item.group && (i === 0 || results[i - 1].group !== item.group)
                    ? item.group
                    : null;
                return (
                  <div key={item.id}>
                    {header && <p className="palette__group">{header}</p>}
                    <button
                      id={`cmd-${item.id}`}
                      data-menu-row
                      type="button"
                      role="option"
                      aria-selected={i === active}
                      onClick={() => run(item)}
                      onMouseMove={() => setCursor(i)}
                      className="palette__item"
                    >
                      {item.icon && <span className="palette__item-icon">{item.icon}</span>}
                      <span className="truncate">{item.label}</span>
                      {item.hint && <span className="palette__item-hint">{item.hint}</span>}
                    </button>
                  </div>
                );
              })}
            </GlideMenu>
          </div>
        )}
      </div>
    </dialog>
  );
}
