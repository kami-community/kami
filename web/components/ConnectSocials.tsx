"use client";

import { useCallback, useEffect, useState } from "react";

type Platform = "x" | "instagram";

interface AccountRow {
  platform: Platform;
  handle: string | null;
  status: string;
}

interface ConnectionsState {
  accounts: AccountRow[];
  configured: { x: boolean; instagram: boolean; token_encryption: boolean; x_ads: boolean };
}

const LABEL: Record<Platform, string> = { x: "X", instagram: "Instagram" };

/** Connected social accounts for a campaign session. */
export function useConnections(sessionId: string | null) {
  const [state, setState] = useState<ConnectionsState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/connections?session_id=${encodeURIComponent(sessionId)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load connections");
      setState(json as ConnectionsState);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load connections");
    }
  }, [sessionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleOf = (platform: Platform) =>
    state?.accounts.find((a) => a.platform === platform && a.status === "connected")?.handle ??
    null;

  return { state, error, reload, handleOf };
}

interface ConnectSocialsProps {
  sessionId: string;
  platforms?: Platform[];
}

/** Connect / disconnect X and Instagram for this campaign (after the dossier is confirmed). */
export default function ConnectSocials({
  sessionId,
  platforms = ["x", "instagram"],
}: ConnectSocialsProps) {
  const { state, error, reload, handleOf } = useConnections(sessionId);
  const [busy, setBusy] = useState<Platform | null>(null);

  async function disconnect(platform: Platform) {
    setBusy(platform);
    try {
      await fetch(
        `/api/connections?session_id=${encodeURIComponent(sessionId)}&platform=${platform}`,
        { method: "DELETE" },
      );
      await reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="connect-socials">
      <span className="label-caps">Accounts</span>
      {platforms.map((platform) => {
        const handle = handleOf(platform);
        if (handle) {
          return (
            <span key={platform} className="mono connect-chip connect-chip--on">
              ✓ {LABEL[platform]} {handle}
              <button
                type="button"
                className="connect-chip__action"
                onClick={() => disconnect(platform)}
                disabled={busy === platform}
                aria-label={`Disconnect ${LABEL[platform]}`}
              >
                ×
              </button>
            </span>
          );
        }
        if (state && !state.configured[platform]) {
          return (
            <span key={platform} className="mono connect-chip connect-chip--off">
              {LABEL[platform]} · app keys not set
            </span>
          );
        }
        if (state && !state.configured.token_encryption) {
          return (
            <span key={platform} className="mono connect-chip connect-chip--off">
              {LABEL[platform]} · set KAMI_TOKEN_ENCRYPTION_KEY
            </span>
          );
        }
        return (
          <a
            key={platform}
            className="mono connect-chip"
            href={`/api/auth/${platform}/login?session_id=${encodeURIComponent(sessionId)}`}
          >
            Connect {LABEL[platform]}
          </a>
        );
      })}
      {error && (
        <span role="alert" className="mono form-error">
          {error}
        </span>
      )}
    </div>
  );
}
