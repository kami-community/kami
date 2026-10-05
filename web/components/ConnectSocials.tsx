"use client";

import { useEffect, useState } from "react";

interface AccountRow {
  platform: string;
  handle: string | null;
  status: string;
}

function ConnectChip({
  connected,
  handle,
  href,
  label,
  configured,
}: {
  connected: boolean;
  handle: string | null;
  href: string;
  label: string;
  configured: boolean;
}) {
  if (connected && handle) {
    return (
      <span
        className="mono"
        style={{
          border: "1px solid var(--ink)",
          background: "var(--moss)",
          color: "var(--paper)",
          padding: "0.35rem 0.75rem",
        }}
      >
        ✓ {label} ({handle})
      </span>
    );
  }
  if (!configured) {
    return (
      <span
        className="mono"
        style={{
          color: "var(--outline)",
          padding: "0.35rem 0.75rem",
          border: "1px dashed var(--outline)",
        }}
      >
        {label} · set app keys
      </span>
    );
  }
  return (
    <a
      href={href}
      className="mono"
      style={{
        border: "1px solid var(--ink)",
        padding: "0.35rem 0.75rem",
        color: "var(--ink)",
      }}
    >
      {label === "X" ? "𝕏 Log in with X" : "Log in with Instagram"}
    </a>
  );
}

/** Landing social connects — X + Instagram OAuth status. */
export default function ConnectSocials() {
  const [xHandle, setXHandle] = useState<string | null>(null);
  const [igHandle, setIgHandle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [xConfigured, setXConfigured] = useState(true);
  const [igConfigured, setIgConfigured] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("x_connect") === "ok") {
      setXHandle(params.get("handle"));
      window.history.replaceState({}, "", "/");
    } else if (params.get("x_connect") === "error") {
      setError(`X: ${params.get("reason") ?? "connection failed"}`);
      window.history.replaceState({}, "", "/");
    }
    if (params.get("ig_connect") === "ok") {
      setIgHandle(params.get("handle"));
      window.history.replaceState({}, "", "/");
    } else if (params.get("ig_connect") === "error") {
      setError(`Instagram: ${params.get("reason") ?? "connection failed"}`);
      window.history.replaceState({}, "", "/");
    }

    fetch("/api/accounts")
      .then((r) => r.json())
      .then((json) => {
        const accounts = (json.accounts ?? []) as AccountRow[];
        const x = accounts.find((a) => a.platform === "x" && a.status === "connected");
        const ig = accounts.find((a) => a.platform === "instagram" && a.status === "connected");
        if (x?.handle) setXHandle(x.handle);
        if (ig?.handle) setIgHandle(ig.handle);
        if (json.oauth) {
          setXConfigured(Boolean(json.oauth.x));
          setIgConfigured(Boolean(json.oauth.instagram));
        }
      })
      .catch(() => {});

    fetch("/api/accounts/status")
      .then((r) => r.json())
      .then((j) => {
        if (typeof j.x_oauth === "boolean") setXConfigured(j.x_oauth);
        if (typeof j.instagram_oauth === "boolean") setIgConfigured(j.instagram_oauth);
      })
      .catch(() => {});
  }, []);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
        alignItems: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <span className="label-caps">Connect accounts:</span>
        <ConnectChip
          connected={Boolean(xHandle)}
          handle={xHandle}
          href="/api/auth/x/login"
          label="X"
          configured={xConfigured}
        />
        <ConnectChip
          connected={Boolean(igHandle)}
          handle={igHandle}
          href="/api/auth/instagram/login"
          label="Instagram"
          configured={igConfigured}
        />
      </div>
      {error && (
        <p className="mono" style={{ color: "var(--hanko)", maxWidth: 480 }}>
          ⚠ {error}
        </p>
      )}
    </div>
  );
}
