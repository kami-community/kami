import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  "primary" | "secondary" | "ghost" | "accent" | "success" | "danger" | "quiet";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

/** Class names for a Beautiful UI pill button — also used on links. */
export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  extra?: string,
): string {
  return `btn btn--${variant} btn--${size}${extra ? ` ${extra}` : ""}`;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and disables the button while an action runs. */
  busy?: boolean;
  icon?: ReactNode;
  /** Keyboard hint rendered after the label, e.g. "⏎". */
  kbd?: string;
  block?: boolean;
};

/**
 * Pill button. One `accent` (or `primary`) action per screen; everything
 * else is `secondary`, `ghost` or `quiet`.
 */
export default function Button({
  variant = "secondary",
  size = "md",
  busy = false,
  icon,
  kbd,
  block = false,
  className,
  disabled,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(
        variant,
        size,
        `${block ? "btn--block" : ""} ${className ?? ""}`.trim(),
      )}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <span className="btn__spinner" aria-hidden /> : icon}
      {children}
      {kbd && (
        <span className="btn__kbd" aria-hidden>
          {kbd}
        </span>
      )}
    </button>
  );
}

/** Square toolbar button. `label` is the accessible name (and tooltip). */
export function IconButton({
  label,
  size = "md",
  className,
  type = "button",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: "sm" | "md" }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`icon-btn${size === "sm" ? " icon-btn--sm" : ""}${className ? ` ${className}` : ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}
