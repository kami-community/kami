"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/ui/Button";
import Field, { Input } from "@/components/ui/Field";
import ThemeToggle from "@/components/ui/ThemeToggle";

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
    <form className="card login__card" onSubmit={submit}>
      <div className="card__body card__body--roomy form-stack">
        <Field
          label="Admin token"
          error={error}
          hint={
            <>
              The <code>KAMI_ADMIN_TOKEN</code> from this instance’s environment.
            </>
          }
        >
          <Input
            type="password"
            autoComplete="current-password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={busy}
            autoFocus
          />
        </Field>
      </div>
      <div className="card__footer">
        <span className="text-3 text-xs">Sessions last 30 days.</span>
        <Button type="submit" variant="accent" size="sm" busy={busy} disabled={!token}>
          Sign in
        </Button>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="login">
      <div className="login__theme">
        <ThemeToggle />
      </div>
      <section className="login__box fade-up">
        <span className="kami-seal kami-seal--lg" aria-hidden>
          K
        </span>
        <h1 className="landing__title login__title">Sign in to Kami</h1>
        <p className="landing__sub">This Kami instance is protected.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </section>
    </main>
  );
}
