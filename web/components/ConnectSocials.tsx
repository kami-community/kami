"use client";

import { useState } from "react";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";

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
  const query = useApi<ConnectionsState>(
    sessionId ? withQuery("/api/connections", { session_id: sessionId }) : null,
  );
  const state = query.data;

  const handleOf = (platform: Platform) =>
    state?.accounts.find((a) => a.platform === platform && a.status === "connected")?.handle ??
    null;

  return { state, error: query.error, reload: query.reload, handleOf };
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
  const [actionError, setActionError] = useState<string | null>(null);

  async function disconnect(platform: Platform) {
    setBusy(platform);
    setActionError(null);
    try {
      await api.del(withQuery("/api/connections", { session_id: sessionId, platform }));
      reload();
    } catch (err) {
      setActionError(errorMessage(err, `Could not disconnect ${LABEL[platform]}`));
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
      {(actionError ?? error) && (
        <span role="alert" className="mono form-error">
          {actionError ?? error}
        </span>
      )}
    </div>
  );
}
