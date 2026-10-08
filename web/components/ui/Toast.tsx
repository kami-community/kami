"use client";

import { useEffect, type ReactNode } from "react";
import { IconAlert, IconCheckCircle, IconClose } from "@/components/ui/icons";

/** A transient corner notice (auto-dismisses after 6s; errors stay until closed). */
export default function Toast({
  tone = "success",
  children,
  onClose,
}: {
  tone?: "success" | "error";
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    if (tone === "error") return;
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [tone, onClose]);

  return (
    <div className={`toast toast--${tone}`} role={tone === "error" ? "alert" : "status"}>
      {tone === "error" ? <IconAlert size={15} /> : <IconCheckCircle size={15} />}
      <span className="toast__text">{children}</span>
      <button
        type="button"
        className="icon-btn icon-btn--sm"
        aria-label="Dismiss"
        onClick={onClose}
      >
        <IconClose size={13} />
      </button>
    </div>
  );
}
