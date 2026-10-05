"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AccountSignal,
  LeadScoreFactors,
  PipelineStage,
  SalesAccount,
  SalesPlan,
} from "@/lib/salesTypes";
import type { SalesSegment } from "@/lib/domain/segments";
import { scoreLabel } from "@/lib/salesMotionLabels";
import SalesFunnel from "@/components/SalesFunnel";
import SalesBusyOverlay from "@/components/SalesBusyOverlay";

interface AccountContact {
  id?: string;
  name?: string;
  email?: string;
}

interface AccountWithMeta extends SalesAccount {
  signals?: AccountSignal[];
  contact?: AccountContact | null;
  score?: {
    factors: LeadScoreFactors;
    explanation: string;
  };
}

interface SalesTargetReviewProps {
  sessionDbId: string | null;
  plan: SalesPlan | null;
  offer?: string;
  segments?: SalesSegment[] | null;
  paused?: boolean;
  onContinue?: () => void;
  onCreateDistribution?: () => void;
}

function isIncluded(account: SalesAccount): boolean {
  if (account.pipeline_stage === "ready_for_approval" || account.pipeline_stage === "sequencing") {
    return !account.notes?.includes("excluded_from_cohort");
  }
  return false;
}

export default function SalesTargetReview({
  sessionDbId,
  plan,
  offer,
  segments,
  paused,
  onContinue,
  onCreateDistribution,
}: SalesTargetReviewProps) {
  const [accounts, setAccounts] = useState<AccountWithMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyMode, setBusyMode] = useState<"discover" | "emails" | "continue" | null>(null);
  const [discoverMsg, setDiscoverMsg] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [emailBanner, setEmailBanner] = useState<string | null>(null);
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
  const [savingEmailId, setSavingEmailId] = useState<string | null>(null);
  const [busyDetail, setBusyDetail] = useState<string | null>(null);
  const [readyToDraft, setReadyToDraft] = useState(false);

  const planApproved = plan?.status === "approved";

  const plgOnly = useMemo(() => {
    const segs = segments ?? [];
    if (!segs.length) return false;
    return segs.every(
      (s) =>
        s.motion === "plg_self_serve" &&
        (!s.candidate_companies || s.candidate_companies.length === 0),
    );
  }, [segments]);

  const hasB2bSeeds = useMemo(() => {
    const segs = segments ?? [];
    return segs.some(
      (s) => s.motion !== "plg_self_serve" || (s.candidate_companies?.length ?? 0) > 0,
    );
  }, [segments]);

  const plgWarningsOnly = useMemo(() => {
    if (accounts.length > 0 || !warnings.length) return false;
    return warnings.every((w) => /plg|individual|self[- ]?serve|not a company|consumer/i.test(w));
  }, [accounts.length, warnings]);

  const distributionPath = plgOnly || plgWarningsOnly;

  const fetchAccounts = useCallback(async () => {
    if (!sessionDbId) return;
    const [accRes, scoreRes] = await Promise.all([
      fetch(`/api/sales/accounts?session_id=${sessionDbId}`),
      fetch(`/api/sales/scores?session_id=${sessionDbId}`),
    ]);
    const accJson = await accRes.json();
    const scoreJson = await scoreRes.json();

    const scoreByAccount: Record<string, { factors: LeadScoreFactors; explanation: string }> = {};
    for (const s of scoreJson.scores ?? []) {
      if (s.account_id && s.factors) {
        scoreByAccount[s.account_id] = { factors: s.factors, explanation: s.explanation };
      }
    }

    const merged = (accJson.accounts ?? []).map((a: AccountWithMeta) => ({
      ...a,
      score: a.id ? scoreByAccount[a.id] : undefined,
    }));
    setAccounts(merged);
  }, [sessionDbId]);

  useEffect(() => {
    if (planApproved) fetchAccounts();
  }, [planApproved, fetchAccounts]);

  const grouped = useMemo(() => {
    const map = new Map<string, AccountWithMeta[]>();
    for (const acc of accounts) {
      const key = acc.segment_key || acc.industry || "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(acc);
    }
    return [...map.entries()];
  }, [accounts]);

  async function runDiscovery() {
    if (!sessionDbId || paused) return;
    setBusy(true);
    setBusyMode("discover");
    setBusyDetail("Verifying domains and looking up public contacts…");
    setError(null);
    setEmailBanner(null);
    setDiscoverMsg(null);
    setWarnings([]);
    setReadyToDraft(false);
    try {
      let json: {
        error?: string;
        warnings?: string[];
        count?: number;
        accounts?: { email?: string | null }[];
      } | null = null;
      try {
        const res = await fetch("/api/sales/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionDbId }),
        });
        json = await res.json();
        if (!res.ok) {
          // May still finish server-side — poll accounts before failing.
          setBusyDetail("Request timed out or failed — checking for saved companies…");
        }
      } catch {
        setBusyDetail("Connection interrupted — checking for saved companies…");
      }

      // Recover accounts if the long discover finished after a client timeout.
      for (const waitMs of [0, 3000, 8000, 15000]) {
        if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
        await fetchAccounts();
        const accRes = await fetch(`/api/sales/accounts?session_id=${sessionDbId}`);
        const accJson = await accRes.json();
        const n = (accJson.accounts ?? []).length;
        if (n > 0) {
          setBusyDetail(`Found ${n} companies so far…`);
          const warn = (json?.warnings as string[]) ?? [];
          setWarnings(warn);
          // Auto-include rows that already have a contact email so the draft CTA appears.
          const withEmail = (accJson.accounts ?? []).filter(
            (a: AccountWithMeta) => a.id && a.contact?.email && !isIncluded(a),
          );
          for (const acc of withEmail) {
            await fetch("/api/sales/scores", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ account_id: acc.id, included: true }),
            });
          }
          await fetchAccounts();
          const included = withEmail.length;
          setDiscoverMsg(
            included > 0
              ? `Found ${n} companies (${included} with email, selected). Click Draft emails to continue.`
              : `Found ${n} companies. Use Find emails, check Include, then Draft emails.`,
          );
          if (included > 0) {
            setEmailBanner(`Ready — draft emails for selected companies.`);
            setReadyToDraft(true);
          }
          return;
        }
        if (json && !json.error && (json.count ?? 0) === 0) break;
      }

      if (json?.error) {
        setError(json.error);
        return;
      }
      const warn = (json?.warnings as string[]) ?? [];
      setWarnings(warn);
      setDiscoverMsg(
        warn[0] ??
          "No verifiable companies found — go back to ICP and refine segments or add real company domains.",
      );
    } finally {
      setBusy(false);
      setBusyMode(null);
      setBusyDetail(null);
    }
  }

  async function findEmailsWithHermes() {
    if (!sessionDbId || paused || busy) return;
    const selected = accounts.filter((a) => a.id && isIncluded(a) && !a.contact?.email);
    const targets = selected.length ? selected : accounts.filter((a) => a.id && !a.contact?.email);

    if (!targets.length) {
      setEmailBanner(null);
      setDiscoverMsg("Every company already has an email, or none are listed yet.");
      return;
    }

    setBusy(true);
    setBusyMode("emails");
    setBusyDetail(`Looking up emails for ${targets.length} companies…`);
    setError(null);
    setEmailBanner(null);
    try {
      const res = await fetch("/api/sales/contacts/find", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionDbId,
          account_ids: targets.map((a) => a.id),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Email lookup failed");
        return;
      }
      const found = json.found ?? 0;
      setDiscoverMsg(json.message ?? `Found ${found} emails`);
      await fetchAccounts();

      if (found === 0) {
        setEmailBanner(
          "Hermes found no public emails on those domains — add manually or uncheck companies without email.",
        );
        setReadyToDraft(false);
      } else {
        // Auto-include accounts that now have emails so the next CTA is obvious.
        const accRes = await fetch(`/api/sales/accounts?session_id=${sessionDbId}`);
        const accJson = await accRes.json();
        const fresh = (accJson.accounts ?? []) as AccountWithMeta[];
        const withEmail = fresh.filter((a) => a.id && a.contact?.email && !isIncluded(a));
        for (const acc of withEmail) {
          await fetch("/api/sales/scores", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account_id: acc.id, included: true }),
          });
        }
        await fetchAccounts();
        setEmailBanner(
          `Found ${found} email${found === 1 ? "" : "s"}. Companies with emails are selected — continue to draft.`,
        );
        setReadyToDraft(true);
      }
    } finally {
      setBusy(false);
      setBusyMode(null);
      setBusyDetail(null);
    }
  }

  async function toggleInclusion(account: AccountWithMeta, included: boolean) {
    if (!account.id) return;
    const res = await fetch("/api/sales/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: account.id, included }),
    });
    if (res.ok) {
      setEmailBanner(null);
      await fetchAccounts();
    }
  }

  async function saveEmail(account: AccountWithMeta): Promise<boolean> {
    if (!sessionDbId || !account.id) return false;
    const email = (emailDrafts[account.id] ?? account.contact?.email ?? "").trim();
    if (!email.includes("@")) return false;

    setSavingEmailId(account.id);
    setError(null);
    try {
      const res = await fetch("/api/sales/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionDbId,
          account_id: account.id,
          name: account.name,
          email,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not save email");
        return false;
      }
      await fetchAccounts();
      return true;
    } finally {
      setSavingEmailId(null);
    }
  }

  async function continueWithSelected() {
    if (!sessionDbId) return;
    const selected = accounts.filter((a) => a.id && isIncluded(a));
    if (!selected.length) {
      setError("Select at least one company to continue.");
      setEmailBanner(null);
      return;
    }

    const missingEmails = selected.filter((a) => {
      const draft = emailDrafts[a.id!]?.trim();
      return !a.contact?.email && !draft?.includes("@");
    });
    if (missingEmails.length) {
      setEmailBanner(
        `${missingEmails.length} of ${selected.length} selected companies need a contact email — use “Find emails with Hermes”, add emails, or uncheck them.`,
      );
      setError(null);
      return;
    }

    setBusy(true);
    setBusyMode("continue");
    setError(null);
    setEmailBanner(null);
    try {
      for (const acc of selected) {
        if (!acc.contact?.email && emailDrafts[acc.id!]?.includes("@")) {
          const ok = await saveEmail(acc);
          if (!ok) return;
        }
      }

      const accRes = await fetch(`/api/sales/accounts?session_id=${sessionDbId}`);
      const accJson = await accRes.json();
      const fresh = (accJson.accounts ?? []) as AccountWithMeta[];
      const withEmail = fresh.filter((a) => a.id && isIncluded(a) && a.contact?.email);
      const accountIds = withEmail.map((a) => a.id!);

      if (!accountIds.length) {
        setEmailBanner(
          `${selected.length} of ${selected.length} selected companies need a contact email — use “Find emails with Hermes” or add emails.`,
        );
        return;
      }

      for (const id of accountIds) {
        const patchRes = await fetch(`/api/sales/accounts/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pipeline_stage: "sequencing" as PipelineStage, actor: "user" }),
        });
        if (!patchRes.ok) {
          const patchJson = await patchRes.json().catch(() => ({}));
          setError(patchJson.error ?? `Could not advance account ${id}`);
          return;
        }
      }

      const seqRes = await fetch("/api/sales/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionDbId, account_ids: accountIds }),
      });
      const seqJson = await seqRes.json();
      if (!seqRes.ok) {
        setError(seqJson.error ?? "Could not create email sequences");
        return;
      }

      const enrolled = seqJson.enrolled_count ?? 0;
      if (enrolled === 0) {
        const skipped = (seqJson.skipped ?? []) as { account_id: string; reason: string }[];
        const reasons = skipped.map((s) => s.reason).filter(Boolean);
        setError(
          reasons.length
            ? `No drafts created — ${reasons.slice(0, 3).join("; ")}`
            : "No drafts created — every selected company was skipped.",
        );
        return;
      }

      await fetchAccounts();
      onContinue?.();
    } finally {
      setBusy(false);
      setBusyMode(null);
    }
  }

  if (!planApproved) {
    return (
      <div
        className="kraft-card"
        style={{ padding: "var(--stack-md)", marginTop: "var(--stack-md)" }}
      >
        <p className="label-caps" style={{ color: "var(--outline)" }}>
          Find companies
        </p>
        <p
          className="mono"
          style={{ color: "var(--ink-soft)", marginTop: "var(--stack-sm)", fontSize: 13 }}
        >
          Approve your plan first, then we&apos;ll research companies that match your confirmed
          segments.
        </p>
      </div>
    );
  }

  const includedCount = accounts.filter((a) => isIncluded(a)).length;
  const missingEmailSelected = accounts.filter(
    (a) => a.id && isIncluded(a) && !a.contact?.email,
  ).length;

  const busyTitle =
    busyMode === "emails"
      ? "Finding contact emails"
      : busyMode === "continue"
        ? "Building sequences"
        : "Finding companies";

  const busyStages =
    busyMode === "emails"
      ? [
          "Scraping company contact pages…",
          "Searching Linkup for @domain emails…",
          "Asking Hermes to extract only evidenced addresses…",
          "Saving verified contacts…",
        ]
      : busyMode === "continue"
        ? ["Saving emails…", "Enrolling sequences…", "Queueing drafts…"]
        : undefined;

  return (
    <div
      className="kraft-card"
      style={{ padding: "var(--stack-md)", marginTop: "var(--stack-md)", position: "relative" }}
    >
      {busy && <SalesBusyOverlay title={busyTitle} stages={busyStages} detail={busyDetail} />}

      {offer && (
        <p
          className="mono"
          style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: "var(--stack-sm)" }}
        >
          Selling: {offer.slice(0, 160)}
          {offer.length > 160 ? "…" : ""}
        </p>
      )}

      <SalesFunnel segments={segments} plan={plan} accounts={accounts} />

      {distributionPath ? (
        <div style={{ marginBottom: "var(--stack-md)" }}>
          <p className="sales-intro" style={{ marginBottom: "var(--stack-sm)" }}>
            These segments are individual buyers/users, not companies to email-blast. Company Find
            does not apply — we will not invent consumer emails.
          </p>
          <p className="mono" style={{ fontSize: 12, color: "var(--ink-soft)" }}>
            Next step: create a distribution campaign (X, Reddit, etc.) so the right people find
            you. If you also have B2B seed companies, add them under Confirm ICP and use Find
            companies.
          </p>
        </div>
      ) : (
        <p className="sales-intro" style={{ marginBottom: "var(--stack-md)" }}>
          We verify named companies from your segments, look up public emails (site → Linkup →
          Hermes), and score Fit × Timing. Check Include, then continue.
        </p>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "var(--stack-sm)",
          flexWrap: "wrap",
          gap: "var(--stack-sm)",
        }}
      >
        <p className="label-caps">{distributionPath ? "Find people to reach" : "Find companies"}</p>
        <div style={{ display: "flex", gap: "var(--stack-sm)", flexWrap: "wrap" }}>
          {hasB2bSeeds && (
            <button
              type="button"
              className="hanko-btn"
              onClick={runDiscovery}
              disabled={busy || paused}
              style={{ opacity: paused ? 0.5 : 1 }}
            >
              {busy && busyMode === "discover" ? "Finding…" : "Find companies"}
            </button>
          )}
          {distributionPath && onCreateDistribution && (
            <button type="button" className="hanko-btn" onClick={onCreateDistribution}>
              Create distribution
            </button>
          )}
          {!distributionPath && (
            <button
              type="button"
              className="mono"
              onClick={findEmailsWithHermes}
              disabled={busy || paused || !accounts.length}
              style={{
                border: "1px solid var(--ink)",
                background: "transparent",
                padding: "0.4rem 0.75rem",
                cursor: busy || paused || !accounts.length ? "not-allowed" : "pointer",
                opacity: accounts.length ? 1 : 0.5,
              }}
              title={
                accounts.length
                  ? "Scrape + Linkup + Hermes — never invents emails"
                  : "Available after companies are listed"
              }
            >
              {busy && busyMode === "emails" ? "Looking up…" : "Find emails with Hermes"}
            </button>
          )}
          {includedCount > 0 && (
            <button
              type="button"
              className="hanko-btn"
              onClick={continueWithSelected}
              disabled={busy}
            >
              {busy && busyMode === "continue"
                ? "Building…"
                : `Draft emails for ${includedCount} compan${includedCount === 1 ? "y" : "ies"}`}
            </button>
          )}
        </div>
      </div>
      {!distributionPath && !accounts.length && (
        <p
          className="mono"
          style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: "var(--stack-sm)" }}
        >
          Find emails with Hermes is available after companies are listed.
        </p>
      )}
      <hr className="crease" />

      {emailBanner && (
        <div
          className="kraft-card"
          style={{
            padding: "var(--stack-sm)",
            marginBottom: "var(--stack-sm)",
            borderColor: "var(--hanko)",
            background: "var(--kraft)",
          }}
        >
          <p style={{ fontSize: 14, marginBottom: "0.5rem" }}>{emailBanner}</p>
          {readyToDraft && includedCount > 0 && (
            <button
              type="button"
              className="hanko-btn"
              onClick={continueWithSelected}
              disabled={busy}
            >
              Draft emails for {includedCount} compan{includedCount === 1 ? "y" : "ies"} →
            </button>
          )}
          {missingEmailSelected > 0 && !readyToDraft && (
            <button
              type="button"
              className="hanko-btn"
              onClick={findEmailsWithHermes}
              disabled={busy || paused}
            >
              Find emails with Hermes ({missingEmailSelected})
            </button>
          )}
        </div>
      )}

      {error && (
        <p
          className="mono"
          style={{ color: "var(--hanko)", fontSize: 13, marginBottom: "var(--stack-sm)" }}
        >
          {error}
        </p>
      )}
      {discoverMsg && (
        <p
          className="mono"
          style={{ color: "var(--ink-soft)", fontSize: 13, marginBottom: "var(--stack-sm)" }}
        >
          {discoverMsg}
        </p>
      )}
      {warnings.map((w, i) => (
        <p
          key={i}
          className="mono"
          style={{ color: "var(--ink-soft)", fontSize: 12, marginBottom: 4 }}
        >
          ⚠ {w}
        </p>
      ))}

      {!accounts.length ? (
        <p
          className="mono"
          style={{ color: "var(--ink-soft)", fontSize: 13, padding: "var(--stack-sm) 0" }}
        >
          No companies yet — click Find companies to verify targets from your confirmed segments.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack-md)" }}>
          {grouped.map(([groupKey, groupAccounts]) => {
            const segName = segments?.find((s) => s.key === groupKey)?.name ?? groupKey;
            return (
              <div key={groupKey}>
                <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
                  {segName}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack-sm)" }}>
                  {groupAccounts.map((acc) => {
                    const selected = isIncluded(acc);
                    const factors = acc.score?.factors;

                    return (
                      <div
                        key={acc.id}
                        style={{
                          border: "1px solid var(--outline-variant)",
                          padding: "var(--stack-sm)",
                          opacity: selected ? 1 : 0.75,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            flexWrap: "wrap",
                            gap: "0.5rem",
                          }}
                        >
                          <div>
                            <strong>{acc.name}</strong>
                            {acc.domain && (
                              <span
                                className="mono"
                                style={{
                                  marginLeft: "0.5rem",
                                  fontSize: 12,
                                  color: "var(--ink-soft)",
                                }}
                              >
                                {acc.domain}
                              </span>
                            )}
                          </div>
                          <label className="mono" style={{ fontSize: 12, cursor: "pointer" }}>
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(e) => toggleInclusion(acc, e.target.checked)}
                              style={{ marginRight: "0.35rem" }}
                            />
                            Include
                          </label>
                        </div>

                        {factors && (
                          <div
                            className="mono"
                            style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: "0.35rem" }}
                          >
                            {scoreLabel("fit", factors.fit)} ·{" "}
                            {scoreLabel("intent", factors.intent)} ·{" "}
                            {scoreLabel("contactability", factors.contactability)}
                          </div>
                        )}
                        {acc.score?.explanation && (
                          <p
                            style={{ fontSize: 13, color: "var(--ink-soft)", margin: "0.25rem 0" }}
                          >
                            {acc.score.explanation}
                          </p>
                        )}

                        {acc.signals?.length ? (
                          <ul
                            style={{ fontSize: 12, paddingLeft: "1.1rem", margin: "0.25rem 0 0" }}
                          >
                            {acc.signals.map((sig, i) => (
                              <li key={sig.id ?? `${sig.source_url}-${i}`}>
                                {sig.detail ?? sig.signal_type}
                                {sig.source_url && (
                                  <>
                                    {" — "}
                                    <a
                                      href={sig.source_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      source
                                    </a>
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : null}

                        {selected && (
                          <div className="sales-inline-email">
                            {acc.contact?.email ? (
                              <span className="mono" style={{ fontSize: 12 }}>
                                Email: {acc.contact.email}
                              </span>
                            ) : (
                              <>
                                <input
                                  type="email"
                                  placeholder="Add contact email"
                                  value={emailDrafts[acc.id ?? ""] ?? ""}
                                  onChange={(e) =>
                                    setEmailDrafts((d) => ({ ...d, [acc.id!]: e.target.value }))
                                  }
                                />
                                <button
                                  type="button"
                                  className="mono"
                                  disabled={savingEmailId === acc.id}
                                  onClick={() => saveEmail(acc)}
                                  style={{
                                    border: "1px solid var(--ink)",
                                    background: "transparent",
                                    padding: "0.3rem 0.6rem",
                                    cursor: "pointer",
                                    fontSize: 11,
                                  }}
                                >
                                  Save
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
