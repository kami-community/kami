"use client";

import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type { BoostCampaign } from "@/lib/marketingTypes";
import type { XTimelinePost } from "@/lib/adapters/x/api";

interface BoostManagerProps {
  sessionDbId: string | null;
}

// Mirrors the server limits in lib/marketing/boost.ts (the server enforces them).
const MIN_BUDGET = 5;
const MAX_BUDGET = 500;
const MAX_DAYS = 30;

interface PendingBoost {
  post: XTimelinePost;
  budget: number;
  days: number;
}

function money(amount: number, currency: string | null): string {
  return currency ? `${amount.toFixed(2)} ${currency}` : amount.toFixed(2);
}

function preview(text: string, max = 90): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Paid X boosts of the founder's own posts. Every boost is confirmed with its spend first. */
export default function BoostManager({ sessionDbId }: BoostManagerProps) {
  const posts = useApi<{ posts: XTimelinePost[]; account: string }>(
    sessionDbId ? withQuery("/api/x/posts", { session_id: sessionDbId }) : null,
  );
  const boosts = useApi<{ boosts: BoostCampaign[]; configured: boolean }>(
    sessionDbId ? withQuery("/api/marketing/boosts", { session_id: sessionDbId }) : null,
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [budget, setBudget] = useState("50");
  const [days, setDays] = useState("7");
  const [pending, setPending] = useState<PendingBoost | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!sessionDbId) return null;

  const configured = boosts.data?.configured ?? false;
  const boostList = boosts.data?.boosts ?? [];
  const liveIds = new Set(
    boostList.filter((b) => b.status === "pending" || b.status === "active").map((b) => b.post_id),
  );
  const candidates = (posts.data?.posts ?? []).filter((p) => !liveIds.has(p.id)).slice(0, 5);

  const budgetValue = Number(budget);
  const daysValue = Number(days);
  const formValid =
    Number.isFinite(budgetValue) &&
    budgetValue >= MIN_BUDGET &&
    budgetValue <= MAX_BUDGET &&
    Number.isInteger(daysValue) &&
    daysValue >= 1 &&
    daysValue <= MAX_DAYS;

  function review(post: XTimelinePost) {
    setActionError(null);
    setNotice(null);
    if (!formValid) {
      setActionError(
        `Budget must be ${MIN_BUDGET}–${MAX_BUDGET} and duration 1–${MAX_DAYS} whole days.`,
      );
      return;
    }
    setPending({ post, budget: Math.round(budgetValue * 100) / 100, days: daysValue });
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setActionError(null);
    try {
      const { boost } = await api.post<{ boost: BoostCampaign }>("/api/marketing/boosts", {
        session_id: sessionDbId,
        post_id: pending.post.id,
        budget: pending.budget,
        duration_days: pending.days,
      });
      setNotice(
        `Boost live on X — campaign ${boost.x_campaign_id}, up to ${money(boost.budget, boost.currency)}.`,
      );
      setSelectedId(null);
      setPending(null);
      boosts.reload();
    } catch (err) {
      setActionError(errorMessage(err, "Boost failed"));
      setPending(null);
      boosts.reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="boost-manager">
      <p className="label-caps">Boost posts</p>
      {!boosts.loading && !boosts.error && !configured && (
        <p className="capability-banner">
          <strong>Paid boosts are off.</strong> Add X Ads API credentials (X_ADS_CONSUMER_KEY,
          X_ADS_CONSUMER_SECRET, X_ADS_ACCESS_TOKEN, X_ADS_ACCESS_TOKEN_SECRET, X_ADS_ACCOUNT_ID)
          from an app approved for Ads API access to promote posts.
        </p>
      )}

      {configured && (
        <div className="inline-form">
          <div className="form-line">
            <label className="mono label-caps" htmlFor="boost-budget">
              Total budget (max {MAX_BUDGET})
            </label>
            <input
              id="boost-budget"
              type="number"
              inputMode="decimal"
              min={MIN_BUDGET}
              max={MAX_BUDGET}
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>
          <div className="form-line">
            <label className="mono label-caps" htmlFor="boost-days">
              Days
            </label>
            <input
              id="boost-days"
              type="number"
              min={1}
              max={MAX_DAYS}
              step="1"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </div>
        </div>
      )}

      {posts.loading && <p className="muted">Loading posts…</p>}
      {posts.error && (
        <p role="alert" className="mono form-error">
          {posts.error}
        </p>
      )}
      {!posts.loading && !posts.error && candidates.length === 0 && (
        <p className="muted">No recent posts to boost. Connect X, publish, then refresh.</p>
      )}

      <ul className="row-list">
        {candidates.map((post) => (
          <li key={post.id} className="row row--flat">
            <span className="row__title">{preview(post.text)}</span>
            <span className="mono muted">
              {post.public_metrics?.like_count ?? 0} likes ·{" "}
              {post.public_metrics?.retweet_count ?? 0} reposts
            </span>
            {configured && (
              <button
                type="button"
                className="btn-outline"
                aria-pressed={selectedId === post.id}
                disabled={busy}
                onClick={() => {
                  setSelectedId(post.id);
                  review(post);
                }}
              >
                Boost…
              </button>
            )}
          </li>
        ))}
      </ul>

      {actionError && (
        <p role="alert" className="mono form-error">
          {actionError}
        </p>
      )}
      {notice && (
        <p className="mono muted" aria-live="polite">
          {notice}
        </p>
      )}

      {boosts.error && (
        <p role="alert" className="mono form-error">
          {boosts.error}
        </p>
      )}
      {boostList.length > 0 && (
        <>
          <p className="label-caps boost-manager__subhead">Boosts</p>
          <ul className="row-list">
            {boostList.map((b) => (
              <li key={b.id} className="row row--flat">
                <span className="row__title">{preview(b.post_text, 60)}</span>
                <span className="mono muted">
                  {b.spend != null ? `${money(b.spend, b.currency)} of ` : "up to "}
                  {money(b.budget, b.currency)}
                  {b.duration_days ? ` · ${b.duration_days}d` : ""}
                </span>
                <span
                  className={`status-pill ${b.status === "active" ? "status-pill--ok" : b.status === "failed" ? "status-pill--failed" : ""}`}
                >
                  {b.status}
                </span>
                {b.x_campaign_id && <span className="mono muted">campaign {b.x_campaign_id}</span>}
                {b.error && <span className="mono form-error boost-manager__error">{b.error}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      <ConfirmDialog
        open={pending !== null}
        title="Spend money on this boost?"
        body={
          pending && (
            <>
              <p>“{preview(pending.post.text, 140)}”</p>
              <p>
                X Ads will spend up to <strong>{pending.budget.toFixed(2)}</strong> (in your ads
                account&apos;s currency) over <strong>{pending.days}</strong> day
                {pending.days === 1 ? "" : "s"}, starting now.
              </p>
            </>
          )
        }
        confirmLabel={pending ? `Boost for ${pending.budget.toFixed(2)}` : "Boost"}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => {
          setPending(null);
          setSelectedId(null);
        }}
      />
    </section>
  );
}
