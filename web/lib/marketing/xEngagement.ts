import { getPostMetrics, getReplies } from "@/lib/adapters/x/api";
import { requireConnection } from "@/lib/connections/service";
import type { Db } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";

/** Refresh public metrics and replies for the campaign's published X posts. */
export async function refreshXEngagement(db: Db, sessionId: string) {
  const { data: posts, error } = await db
    .from("outbound_receipts")
    .select("id, provider_message_id")
    .eq("session_id", sessionId)
    .eq("channel", "x_post")
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(25);
  if (error) throw new AppError("internal", error.message);
  if (!posts?.length) return { checked: 0, updated: 0 };

  const account = await requireConnection(db, sessionId, "x");
  const byPostId = new Map(posts.map((p) => [p.provider_message_id as string, p.id as string]));
  const metrics = await getPostMetrics(account.accessToken, [...byPostId.keys()]);

  let updated = 0;
  for (const post of metrics) {
    const receiptId = byPostId.get(post.id);
    if (!receiptId) continue;
    const counts = post.public_metrics ?? {};
    const replies =
      (counts.reply_count ?? 0) > 0 ? await getReplies(account.accessToken, post.id) : [];
    await db.from("outbound_receipts").update({ metrics: counts, replies }).eq("id", receiptId);
    updated++;
  }
  return { checked: posts.length, updated, account: account.handle };
}
