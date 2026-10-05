"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/";
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Sign-in failed");
        return;
      }
      router.replace(next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch {
      setError("Network error — is the server running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="landing-form" onSubmit={submit}>
      <div className="form-line" style={{ minWidth: 280, textAlign: "left" }}>
        <label className="mono label-caps" htmlFor="admin-token">
          ADMIN TOKEN
        </label>
        <input
          id="admin-token"
          type="password"
          autoComplete="current-password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={busy}
          autoFocus
        />
      </div>
      <button className="hanko-btn landing-cta" type="submit" disabled={busy || !token}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      {error && (
        <p role="alert" className="mono form-error">
          {error}
        </p>
      )}
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="container">
      <section className="landing-hero">
        <h1 className="landing-brand">
          KA<span className="brand-accent">MI</span>
        </h1>
        <p className="landing-sub">
          This Kami instance is protected. Enter the <code>KAMI_ADMIN_TOKEN</code> from its
          environment.
        </p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
