"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";

export default function Nav() {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <nav
      style={{
        borderBottom: "1px solid var(--crease)",
        padding: "0 var(--margin-page)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        maxWidth: 1440,
        margin: "0 auto",
        height: 64,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", height: "100%" }}>
        {pathname !== "/" && (
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="mono"
            style={{
              border: "1px solid var(--ink)",
              background: "transparent",
              padding: "0.25rem 0.55rem",
              cursor: "pointer",
              color: "var(--ink)",
              fontSize: 12,
            }}
          >
            ← back
          </button>
        )}
        <Link
          href="/"
          aria-label="Kami home"
          style={{ display: "flex", alignItems: "center", height: "100%", lineHeight: 0 }}
        >
          <img
            src="/kami-logo.png"
            alt="Kami"
            style={{ height: "100%", width: "auto", objectFit: "contain", display: "block" }}
          />
        </Link>
      </div>
    </nav>
  );
}
