"use client";

import { useId, useState, type ReactNode } from "react";
import { IconChevronDown } from "@/components/ui/icons";

/** Animated height collapse (grid-rows 0fr → 1fr). */
export function Collapse({
  open,
  children,
  id,
}: {
  open: boolean;
  children: ReactNode;
  id?: string;
}) {
  return (
    <div id={id} className="collapse" data-open={open} inert={!open}>
      <div className="collapse__inner">{children}</div>
    </div>
  );
}

/** A quiet "show more" trigger with a rotating chevron and animated body. */
export default function Disclosure({
  label,
  children,
  defaultOpen = false,
  icon,
}: {
  label: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="disclosure">
      <button
        type="button"
        className="disclosure__trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        {label}
        <IconChevronDown size={14} strokeWidth={2.2} className="disclosure__chevron" />
      </button>
      <Collapse open={open} id={id}>
        <div style={{ paddingTop: 8 }}>{children}</div>
      </Collapse>
    </div>
  );
}
