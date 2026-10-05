"use client";

import { useMemo, useState } from "react";
import { ApiError, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import { companies, hasEligibleEmail, isIncluded, looksLikeEmail, mergeScores } from "./rules";
import type { AccountWithMeta, ScoreRow } from "./rules";
import type { BusyMode } from "./TargetActions";
import { EMPTY_NOTICES, type Notices } from "./TargetNotices";
import * as targetApi from "./targetApi";

const RECOVERY_WAITS_MS = [0, 3000, 8000, 15000];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A discover call that may still be finishing server-side (timeout, dropped connection, 5xx). */
function mayStillFinish(err: unknown): boolean {
  return !(err instanceof ApiError) || err.status === 0 || err.status >= 500;
}

/** Accounts, scores and every Find-step action, with busy/notice state for the view. */
export function useTargetReview(sessionId: string, enabled: boolean, onContinue?: () => void) {
  const accountsQuery = useApi<{ accounts: AccountWithMeta[] }>(
    enabled ? withQuery("/api/sales/accounts", { session_id: sessionId }) : null,
  );
  const scoresQuery = useApi<{ scores: ScoreRow[] }>(
    enabled ? withQuery("/api/sales/scores", { session_id: sessionId }) : null,
  );
  const accounts = useMemo(
    () => mergeScores(accountsQuery.data?.accounts ?? [], scoresQuery.data?.scores ?? []),
    [accountsQuery.data, scoresQuery.data],
  );
  const loadError = accountsQuery.error ?? scoresQuery.error;

  const [busyMode, setBusyMode] = useState<BusyMode>(null);
  const [busyDetail, setBusyDetail] = useState<string | null>(null);
  const [notices, setNotices] = useState<Notices>(EMPTY_NOTICES);
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
  const [savingEmailId, setSavingEmailId] = useState<string | null>(null);

  function refresh() {
    accountsQuery.reload();
    scoresQuery.reload();
  }

  async function run(mode: BusyMode, detail: string | null, work: () => Promise<void>) {
    setBusyMode(mode);
    setBusyDetail(detail);
    setNotices(EMPTY_NOTICES);
    try {
      await work();
    } catch (err) {
      setNotices((n) => ({ ...n, error: errorMessage(err) }));
    } finally {
      setBusyMode(null);
      setBusyDetail(null);
      refresh();
    }
  }

  const discover = () =>
    run("discover", "Verifying domains and looking up public contacts…", async () => {
      let result: targetApi.DiscoverResponse | null = null;
      try {
        result = await targetApi.discover(sessionId);
      } catch (err) {
        if (!mayStillFinish(err)) throw err;
        setBusyDetail("Request interrupted — checking for saved companies…");
      }
      // Discovery can outlive the request; recover accounts it saved before giving up.
      for (const wait of RECOVERY_WAITS_MS) {
        if (wait) await sleep(wait);
        const fresh = await targetApi.loadTargetAccounts(sessionId);
        if (fresh.length) {
          const included = await targetApi.includeAccountsWithEmail(sessionId, fresh);
          setNotices({
            banner: included > 0 ? "Ready — draft emails for selected companies." : null,
            error: null,
            message:
              included > 0
                ? `Found ${companies(fresh.length)} (${included} with email, selected). Click Draft emails to continue.`
                : `Found ${companies(fresh.length)}. Use Find emails, check Include, then Draft emails.`,
            warnings: result?.warnings ?? [],
          });
          return;
        }
        if (result) break;
      }
      if (!result) throw new Error("Discovery did not finish — try Find companies again.");
      setNotices({
        ...EMPTY_NOTICES,
        message:
          result.warnings[0] ??
          "No verifiable companies found — go back to ICP and refine segments or add real company domains.",
        warnings: result.warnings,
      });
    });

  const findEmails = () => {
    const selected = accounts.filter((a) => a.id && isIncluded(a) && !a.contact?.email);
    const targets = selected.length ? selected : accounts.filter((a) => a.id && !a.contact?.email);
    if (!targets.length) {
      setNotices({
        ...EMPTY_NOTICES,
        message: "Every company already has an email, or none are listed yet.",
      });
      return;
    }
    void run("emails", `Looking up emails for ${companies(targets.length)}…`, async () => {
      const res = await targetApi.findContacts(
        sessionId,
        targets.map((a) => a.id!),
      );
      const included =
        res.found > 0
          ? await targetApi.includeAccountsWithEmail(
              sessionId,
              await targetApi.loadTargetAccounts(sessionId),
            )
          : 0;
      setNotices({
        ...EMPTY_NOTICES,
        message: res.message,
        banner:
          res.found === 0
            ? "Hermes found no public emails on those domains — add them by hand or uncheck those companies."
            : `Found ${res.found} email${res.found === 1 ? "" : "s"}${included ? "; those companies are selected" : ""}. Continue to draft.`,
      });
    });
  };

  async function toggle(account: AccountWithMeta, included: boolean) {
    if (!account.id) return;
    try {
      await targetApi.setIncluded(sessionId, account.id, included);
      setNotices(EMPTY_NOTICES);
      refresh();
    } catch (err) {
      setNotices({ ...EMPTY_NOTICES, error: errorMessage(err, "Could not update the company") });
    }
  }

  async function saveEmail(account: AccountWithMeta): Promise<boolean> {
    if (!account.id) return false;
    const email = (emailDrafts[account.id] ?? "").trim();
    if (!looksLikeEmail(email)) {
      setNotices({ ...EMPTY_NOTICES, error: `Enter a valid email for ${account.name}.` });
      return false;
    }
    setSavingEmailId(account.id);
    try {
      await targetApi.saveContactEmail(sessionId, account, email);
      setEmailDrafts((d) => ({ ...d, [account.id!]: "" }));
      refresh();
      return true;
    } catch (err) {
      setNotices({ ...EMPTY_NOTICES, error: errorMessage(err, "Could not save the email") });
      return false;
    } finally {
      setSavingEmailId(null);
    }
  }

  const draftEmails = () => {
    const selected = accounts.filter((a) => a.id && isIncluded(a));
    if (!selected.length) {
      setNotices({ ...EMPTY_NOTICES, error: "Select at least one company to continue." });
      return;
    }
    const missing = selected.filter(
      (a) => !hasEligibleEmail(a) && !looksLikeEmail(emailDrafts[a.id!] ?? ""),
    );
    if (missing.length) {
      setNotices({
        ...EMPTY_NOTICES,
        banner: `${missing.length} of ${companies(selected.length)} selected need a contact email — use “Find emails with Hermes”, add emails, or uncheck them.`,
      });
      return;
    }
    void run("continue", null, async () => {
      for (const acc of selected) {
        if (!hasEligibleEmail(acc) && !(await saveEmail(acc))) return;
      }
      const fresh = await targetApi.loadTargetAccounts(sessionId);
      const ids = fresh
        .filter((a) => a.id && isIncluded(a) && hasEligibleEmail(a))
        .map((a) => a.id!);
      if (!ids.length)
        throw new Error("None of the selected companies has a usable contact email.");
      const res = await targetApi.createSequences(sessionId, ids);
      if (res.enrolled_count === 0) {
        const reasons = res.skipped.map((s) => s.reason).filter(Boolean);
        throw new Error(
          reasons.length
            ? `No drafts created — ${reasons.slice(0, 3).join("; ")}`
            : "No drafts created — every selected company was skipped.",
        );
      }
      onContinue?.();
    });
  };

  return {
    accounts,
    loading: accountsQuery.loading || scoresQuery.loading,
    loadError,
    busyMode,
    busyDetail,
    notices,
    emailDrafts,
    savingEmailId,
    setEmailDraft: (id: string, value: string) => setEmailDrafts((d) => ({ ...d, [id]: value })),
    discover,
    findEmails,
    toggle,
    saveEmail,
    draftEmails,
  };
}
