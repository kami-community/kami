"use client";

import { useCallback, useEffect, useState } from "react";
import type { XPost, BoostCampaign } from "@/lib/marketingTypes";
import StatusChip from "@/components/StatusChip";

interface BoostManagerProps {
  sessionDbId: string | null;
}

function statusLabel(status: string, adsConnected: boolean): string {
  if (status === "pending" && !adsConnected) return "queued (Ads not connected)";
  if (status === "pending") return "pending";
  return status;
}

export default function BoostManager({ sessionDbId }: BoostManagerProps) {
  const [posts, setPosts] = useState<XPost[]>([]);
  const [boosts, setBoosts] = useState<BoostCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [adsConnected, setAdsConnected] = useState(false);
  const [boostMsg, setBoostMsg] = useState<string | null>(null);

  const fetchPosts = useCallback(() => {
    setLoading(true);
    setPostsError(null);
    const qs = sessionDbId ? `?session_id=${encodeURIComponent(sessionDbId)}` : "";
    fetch(`/api/x/posts${qs}`)
      .then(async (r) => {
        const j = await r.json();
        setPosts(j.posts ?? []);
        if (j.error) setPostsError(j.error);
      })
      .catch(() => setPostsError("Could not load posts"))
      .finally(() => setLoading(false));
  }, [sessionDbId]);

  const fetchBoosts = useCallback(() => {
    if (!sessionDbId) return;
    fetch(`/api/x/boost?session_id=${encodeURIComponent(sessionDbId)}`)
      .then((r) => r.json())
      .then((j) => setBoosts(j.campaigns ?? []))
      .catch(() => {});
  }, [sessionDbId]);

  useEffect(() => {
    fetchPosts();
    fetchBoosts();
    fetch("/api/accounts/status")
      .then((r) => r.json())
      .then((j) => setAdsConnected(Boolean(j.x_ads)))
      .catch(() => {});
  }, [fetchPosts, fetchBoosts]);

  async function boost(post: XPost) {
    setBoostMsg(null);
    const res = await fetch("/api/x/boost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ post_id: post.id, post_text: post.text, session_id: sessionDbId }),
    });
    const json = await res.json();
    if (json.campaign) {
      setBoosts((prev) => [json.campaign, ...prev.filter((b) => b.id !== json.campaign.id)]);
      setBoostMsg(
        adsConnected
          ? "Boost campaign created."
          : "Queued — X Ads not connected. Add X_ADS_ACCESS_TOKEN + X_ADS_ACCOUNT_ID for live boosts.",
      );
    } else {
      setBoostMsg(json.error ?? "Boost failed");
    }
  }

  const boostedIds = new Set(boosts.map((b) => b.post_id));

  return (
    <div style={{ marginBottom: "var(--stack-md)" }}>
      <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
        Boost Posts
      </p>
      {!adsConnected && (
        <p
          className="mono"
          style={{ fontSize: 11, color: "var(--ink-soft)", marginBottom: "var(--stack-sm)" }}
        >
          Boost queues campaigns locally until X Ads API keys are configured.
        </p>
      )}
      {loading && (
        <p className="mono" style={{ color: "var(--ink-soft)" }}>
          Loading posts…
        </p>
      )}
      {postsError && (
        <p
          className="mono"
          style={{ color: "var(--hanko)", fontSize: 12, marginBottom: "var(--stack-sm)" }}
        >
          {postsError}
        </p>
      )}
      {!loading && !postsError && posts.length === 0 && (
        <p className="mono" style={{ color: "var(--ink-soft)", fontSize: 12 }}>
          No recent posts found. Connect X on the landing page, then refresh.
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack-sm)" }}>
        {posts
          .filter((p) => !boostedIds.has(p.id))
          .slice(0, 5)
          .map((post) => (
            <div className="kraft-card" key={post.id} style={{ padding: "0.75rem 1rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem",
                }}
              >
                <p
                  style={{
                    flex: 1,
                    fontSize: 13,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {post.text.slice(0, 80)}
                  {post.text.length > 80 ? "…" : ""}
                </p>
                <span
                  className="mono"
                  style={{ fontSize: 11, color: "var(--ink-soft)", whiteSpace: "nowrap" }}
                >
                  {post.public_metrics?.like_count ?? 0} ♥ ·{" "}
                  {post.public_metrics?.retweet_count ?? 0} ↻
                </span>
                <button
                  className="mono"
                  onClick={() => boost(post)}
                  style={{
                    border: "1px solid var(--ink)",
                    background: "transparent",
                    padding: "0.3rem 0.7rem",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Boost
                </button>
              </div>
            </div>
          ))}
      </div>
      {boostMsg && (
        <p
          className="mono"
          style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: "var(--stack-sm)" }}
        >
          {boostMsg}
        </p>
      )}
      {boosts.length > 0 && (
        <div style={{ marginTop: "var(--stack-md)" }}>
          <p className="label-caps" style={{ marginBottom: "var(--stack-sm)" }}>
            {adsConnected ? "Active Boosts" : "Queued Boosts"}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--stack-sm)" }}>
            {boosts.map((b) => (
              <div className="kraft-card" key={b.id} style={{ padding: "0.75rem 1rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "1rem",
                  }}
                >
                  <p style={{ flex: 1, fontSize: 13 }}>{b.post_text.slice(0, 60)}…</p>
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink-soft)" }}>
                    ${b.spend ?? 0} / ${b.budget}
                  </span>
                  <StatusChip label={statusLabel(b.status, adsConnected)} />
                </div>
                {(b.impressions != null || b.clicks != null) && (
                  <p
                    className="mono"
                    style={{ fontSize: 11, color: "var(--ink-soft)", marginTop: "0.3rem" }}
                  >
                    {b.impressions ?? 0} impressions · {b.clicks ?? 0} clicks
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
