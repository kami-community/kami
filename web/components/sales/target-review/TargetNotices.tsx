"use client";

export interface Notices {
  banner: string | null;
  error: string | null;
  message: string | null;
  warnings: string[];
}

export const EMPTY_NOTICES: Notices = { banner: null, error: null, message: null, warnings: [] };

/** Status lines for the Find step: next-step banner, error, progress message, warnings. */
export default function TargetNotices({ banner, error, message, warnings }: Notices) {
  return (
    <div className="target-notices" aria-live="polite">
      {banner && <p className="target-banner">{banner}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && <p className="mono muted">{message}</p>}
      {warnings.map((w, i) => (
        <p key={i} className="mono muted target-warning">
          ⚠ {w}
        </p>
      ))}
    </div>
  );
}
