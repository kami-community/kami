"use client";

import { useState } from "react";
import { PlatformMark } from "@/components/marketing/platforms";
import Button, { buttonClass } from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import { StatusPill } from "@/components/ui/Pills";
import Skeleton from "@/components/ui/Skeleton";
import { IconClose } from "@/components/ui/icons";
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

  return { state, error: query.error, loading: query.loading, reload: query.reload, handleOf };
}

interface ConnectSocialsProps {
  sessionId: string;
  platforms?: Platform[];
  /** `inline` (default): compact chips for toolbars. `list`: one described row per account, for Settings. */
  layout?: "inline" | "list";
}

const PURPOSE: Record<Platform, string> = {
  x: "Post the replies you approve and boost your own posts. Kami never posts without your click.",
  instagram: "Send creator DMs you approve from the Creators tab and receive their replies.",
};

/** Connect / disconnect X and Instagram for this campaign (after the dossier is confirmed). */
export default function ConnectSocials({
  sessionId,
  platforms = ["x", "instagram"],
  layout = "inline",
}: ConnectSocialsProps) {
  const { state, error, loading, reload, handleOf } = useConnections(sessionId);
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

  const connectHref = (platform: Platform) =>
    `/api/auth/${platform}/login?session_id=${encodeURIComponent(sessionId)}`;

  if (layout === "list") {
    return (
      <div className="connect-list">
        {loading && !state && <Skeleton lines={2} />}
        {state &&
          platforms.map((platform) => {
            const handle = handleOf(platform);
            const blocked = !state.configured[platform]
              ? "The app keys for this platform aren’t set in this install’s environment."
              : !state.configured.token_encryption
                ? "Set KAMI_TOKEN_ENCRYPTION_KEY so Kami can store the access token safely."
                : null;
            return (
              <div key={platform} className="connect-list__row">
                <PlatformMark platform={platform} size={28} />
                <div className="connect-list__copy">
                  <span className="connect-list__name">
                    {LABEL[platform]}
                    {handle ? (
                      <StatusPill tone="green">Connected as {handle}</StatusPill>
                    ) : blocked ? (
                      <StatusPill tone="neutral">Not available</StatusPill>
                    ) : (
                      <StatusPill tone="neutral">Not connected</StatusPill>
                    )}
                  </span>
                  <span className="connect-list__hint">{blocked ?? PURPOSE[platform]}</span>
                </div>
                {handle ? (
                  <Button
                    size="sm"
                    variant="quiet"
                    busy={busy === platform}
                    onClick={() => void disconnect(platform)}
                  >
                    Disconnect
                  </Button>
                ) : (
                  !blocked && (
                    <a className={buttonClass("secondary", "sm")} href={connectHref(platform)}>
                      Connect {LABEL[platform]}
                    </a>
                  )
                )}
              </div>
            );
          })}
        {(actionError ?? error) && (
          <Callout tone="error" title="Connections">
            {actionError ?? error}
          </Callout>
        )}
      </div>
    );
  }

  return (
    <div className="connect">
      {platforms.map((platform) => {
        const handle = handleOf(platform);
        if (handle) {
          return (
            <span key={platform} className="connect__chip is-on">
              <PlatformMark platform={platform} size={16} />
              {handle}
              <button
                type="button"
                className="connect__remove"
                onClick={() => void disconnect(platform)}
                disabled={busy === platform}
                aria-label={`Disconnect ${LABEL[platform]}`}
              >
                <IconClose size={11} />
              </button>
            </span>
          );
        }
        if (state && !state.configured[platform]) {
          return (
            <span
              key={platform}
              className="connect__chip is-off"
              title="Set the app keys in the environment"
            >
              <PlatformMark platform={platform} size={16} />
              {LABEL[platform]} · app keys not set
            </span>
          );
        }
        if (state && !state.configured.token_encryption) {
          return (
            <span key={platform} className="connect__chip is-off">
              <PlatformMark platform={platform} size={16} />
              {LABEL[platform]} · set KAMI_TOKEN_ENCRYPTION_KEY
            </span>
          );
        }
        return (
          <a key={platform} className={buttonClass("secondary", "xs")} href={connectHref(platform)}>
            <PlatformMark platform={platform} size={16} />
            Connect {LABEL[platform]}
          </a>
        );
      })}
      {(actionError ?? error) && (
        <span role="alert" className="field__error">
          {actionError ?? error}
        </span>
      )}
    </div>
  );
}
