"use client";

import { useState, type ReactNode } from "react";
import { ScrubField } from "@/components/bui/FineTuneCard";
import TaskRows from "@/components/bui/TaskRows";
import ConfirmDialog from "@/components/ConfirmDialog";
import ConnectSocials, { useConnections } from "@/components/ConnectSocials";
import Button from "@/components/ui/Button";
import Callout from "@/components/ui/Callout";
import Card, { CardBody } from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { IconBolt, IconRocket, IconX } from "@/components/ui/icons";
import { Section } from "@/components/ui/Page";
import { StatusPill } from "@/components/ui/Pills";
import Skeleton from "@/components/ui/Skeleton";
import { api, errorMessage, withQuery } from "@/lib/client/api";
import { useApi } from "@/lib/client/useApi";
import type { BoostCampaign } from "@/lib/marketingTypes";
import type { XTimelinePost } from "@/lib/adapters/x/api";

interface BoostManagerProps {
  sessionDbId: string | null;
  /** a link to where X is connected; falls back to an inline connect button */
  connectX?: ReactNode;
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
export default function BoostManager({ sessionDbId, connectX }: BoostManagerProps) {
  const connections = useConnections(sessionDbId);
  const xHandle = connections.handleOf("x");
  const posts = useApi<{ posts: XTimelinePost[]; account: string }>(
    sessionDbId && xHandle ? withQuery("/api/x/posts", { session_id: sessionDbId }) : null,
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

  if (connections.loading && !connections.state) return <Skeleton title lines={4} />;
  if (connections.error) {
    return (
      <Callout
        tone="error"
        title="Could not check your X connection"
        actions={
          <Button size="sm" variant="secondary" onClick={connections.reload}>
            Retry
          </Button>
        }
      >
        {connections.error}
      </Callout>
    );
  }
  if (!xHandle) {
    return (
      <EmptyState
        title="Connect X to boost your posts"
        icon={<IconX size={15} />}
        action={connectX ?? <ConnectSocials sessionId={sessionDbId} platforms={["x"]} />}
      >
        Boosts promote posts from your own X account. Kami lists your recent posts once X is
        connected.
      </EmptyState>
    );
  }

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
    <>
      {!boosts.loading && !boosts.error && !configured && (
        <Callout tone="info" title="Paid boosts are off">
          Add X Ads API credentials (X_ADS_CONSUMER_KEY, X_ADS_CONSUMER_SECRET, X_ADS_ACCESS_TOKEN,
          X_ADS_ACCESS_TOKEN_SECRET, X_ADS_ACCOUNT_ID) from an app approved for Ads API access.
        </Callout>
      )}

      <Section
        num="01"
        title="Your recent posts"
        desc="Pick a post to boost — you confirm the spend before anything starts."
      >
        {configured && (
          <Card tone="inset" className="boost-limits-card">
            <CardBody className="boost-limits">
              <span className="text-2 text-sm">Each boost</span>
              <ScrubField
                label="Budget"
                value={Number(budget) || MIN_BUDGET}
                min={MIN_BUDGET}
                max={MAX_BUDGET}
                onChange={(v) => setBudget(String(v))}
                suffix="total"
              />
              <ScrubField
                label="Days"
                value={Number(days) || 1}
                min={1}
                max={MAX_DAYS}
                onChange={(v) => setDays(String(v))}
              />
            </CardBody>
          </Card>
        )}
        {posts.loading && !posts.data && <Skeleton lines={3} />}
        {posts.error && <Callout tone="error">{posts.error}</Callout>}
        {!posts.loading && !posts.error && candidates.length === 0 && (
          <EmptyState title="No recent posts to boost" icon={<IconX size={15} />}>
            Publish on X as {xHandle}, then come back to boost a post.
          </EmptyState>
        )}
        <div className="stack stack--sm">
          {candidates.map((post) => (
            <Card key={post.id}>
              <CardBody className="boost-post">
                <span className="boost-post__text">{preview(post.text, 160)}</span>
                <span className="text-3 text-xs tabular">
                  {post.public_metrics?.like_count ?? 0} likes ·{" "}
                  {post.public_metrics?.retweet_count ?? 0} reposts
                </span>
                {configured && (
                  <Button
                    size="xs"
                    variant="secondary"
                    icon={<IconRocket size={12} />}
                    aria-pressed={selectedId === post.id}
                    disabled={busy}
                    onClick={() => {
                      setSelectedId(post.id);
                      review(post);
                    }}
                  >
                    Boost…
                  </Button>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
        <div className="stack stack--sm dist-note">
          {actionError && <Callout tone="error">{actionError}</Callout>}
          {notice && <Callout tone="success">{notice}</Callout>}
        </div>
      </Section>

      {(boostList.length > 0 || boosts.error) && (
        <Section
          num="02"
          title="Boosts"
          desc="Every boost with its X campaign id — the proof it ran."
        >
          {boosts.error && <Callout tone="error">{boosts.error}</Callout>}
          <TaskRows
            rows={boostList.map((b, i) => ({
              key: b.id,
              label: preview(b.post_text, 60),
              amount: `${b.spend != null ? `${money(b.spend, b.currency)} of ` : "up to "}${money(b.budget, b.currency)}`,
              status:
                b.status === "active" || b.status === "completed"
                  ? "done"
                  : b.status === "failed"
                    ? "failed"
                    : "running",
              step: i + 1,
              pill:
                b.status === "active" ? (
                  <StatusPill tone="green">Active</StatusPill>
                ) : b.status === "failed" ? undefined : (
                  <StatusPill tone="accent">{b.status}</StatusPill>
                ),
              details: [
                ...(b.x_campaign_id ? [{ label: "X campaign", meta: b.x_campaign_id }] : []),
                ...(b.duration_days
                  ? [{ label: "Duration", meta: `${b.duration_days} days` }]
                  : []),
                ...(b.error ? [{ label: b.error }] : []),
              ],
            }))}
          />
        </Section>
      )}

      <ConfirmDialog
        open={pending !== null}
        title="Spend money on this boost?"
        body={
          pending && (
            <div className="stack stack--sm">
              <p>“{preview(pending.post.text, 140)}”</p>
              <p>
                <IconBolt size={12} /> X Ads will spend up to{" "}
                <strong>{pending.budget.toFixed(2)}</strong> (in your ads account&apos;s currency)
                over <strong>{pending.days}</strong> day{pending.days === 1 ? "" : "s"}, starting
                now.
              </p>
            </div>
          )
        }
        confirmLabel={pending ? `Boost for ${pending.budget.toFixed(2)}` : "Boost"}
        tone="danger"
        busy={busy}
        onConfirm={confirm}
        onCancel={() => {
          setPending(null);
          setSelectedId(null);
        }}
      />
    </>
  );
}
