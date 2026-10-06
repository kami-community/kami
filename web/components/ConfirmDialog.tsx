"use client";

import { useEffect, useRef } from "react";
import Button, { type ButtonVariant } from "@/components/ui/Button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** "danger" for irreversible actions */
  tone?: "default" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Accessible modal confirmation (native <dialog>: focus trap, Esc to cancel). */
export default function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "default",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const variant: ButtonVariant = tone === "danger" ? "danger" : "accent";

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="confirm-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onCancel();
      }}
    >
      <div className="dialog__body">
        <h2 id="confirm-dialog-title" className="dialog__title">
          {title}
        </h2>
        {body && <div className="dialog__text">{body}</div>}
      </div>
      <div className="dialog__footer">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button variant={variant} size="sm" onClick={onConfirm} busy={busy} autoFocus>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
