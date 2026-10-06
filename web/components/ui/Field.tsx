import {
  cloneElement,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

interface FieldProps {
  label: ReactNode;
  /** One form control; it receives the generated id and aria wiring. */
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  className?: string;
  /** Extra content on the right of the label row (e.g. a counter). */
  aside?: ReactNode;
}

/** A labelled form control with hint and error, wired for screen readers. */
export default function Field({
  label,
  children,
  hint,
  error,
  optional,
  hideLabel,
  className,
  aside,
}: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })
    : children;

  return (
    <div className={`field${className ? ` ${className}` : ""}`}>
      <div className={hideLabel ? "sr-only" : "field__label-row"}>
        <label className="field__label" htmlFor={id}>
          {label}
          {optional && <span className="field__optional"> · optional</span>}
        </label>
        {aside}
      </div>
      {control}
      {hint && (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({
  className,
  size,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & { size?: "sm" | "md" }) {
  return (
    <input
      className={`input${size === "sm" ? " input--sm" : ""}${className ? ` ${className}` : ""}`}
      {...rest}
    />
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`textarea${className ? ` ${className}` : ""}`} {...rest} />;
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`select${className ? ` ${className}` : ""}`} {...rest} />;
}
