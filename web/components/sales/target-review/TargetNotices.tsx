"use client";

import Callout from "@/components/ui/Callout";

export interface Notices {
  banner: string | null;
  error: string | null;
  message: string | null;
  warnings: string[];
}

export const EMPTY_NOTICES: Notices = { banner: null, error: null, message: null, warnings: [] };

/** Status for the Find step: next-step banner, error, progress message, warnings. */
export default function TargetNotices({ banner, error, message, warnings }: Notices) {
  if (!banner && !error && !message && !warnings.length) return null;
  return (
    <div className="stack stack--sm target-notices" aria-live="polite">
      {banner && <Callout tone="info">{banner}</Callout>}
      {error && <Callout tone="error">{error}</Callout>}
      {message && <Callout tone="neutral">{message}</Callout>}
      {warnings.length > 0 && (
        <Callout
          tone="warn"
          title={`${warnings.length} note${warnings.length === 1 ? "" : "s"} from the search`}
        >
          <ul className="bullet-list">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </Callout>
      )}
    </div>
  );
}
