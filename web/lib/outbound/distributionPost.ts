import { createPost, validatePostText } from "@/lib/adapters/x/api";
import { requireConnection } from "@/lib/connections/service";
import type { Db } from "@/lib/db/client";
import { AppError, badRequest, conflict, notFound } from "@/lib/http/errors";
import { assertNotPaused } from "./policy";
import { claimReceipt, completeReceipt, failReceipt, type OutboundReceipt } from "./receipts";

/**
 * Publish an approved distribution opportunity to X as the connected account.
 * The founder's click is the approval; the post text is what they confirmed.
 */
export async function publishOpportunityToX(
  db: Db,
  params: { sessionId: string; opportunityId: string; text: string },
): Promise<{ receipt: OutboundReceipt; account: string }> {
  const { data: opp, error } = await db
    .from("distribution_opportunities")
    .select("id, platform, action_status")
    .eq("id", params.opportunityId)
    .eq("session_id", params.sessionId)
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!opp) throw notFound("opportunity not found for this campaign");
  if (opp.platform !== "x")
    throw badRequest(`this is a ${opp.platform} opportunity — post it manually`);
  if (opp.action_status === "published") throw conflict("this opportunity is already published");

  const text = validatePostText(params.text);
  await assertNotPaused(db, params.sessionId, "distribution");
  const account = await requireConnection(db, params.sessionId, "x");

  const claim = await claimReceipt(
    db,
    {
      sessionId: params.sessionId,
      channel: "x_post",
      idempotencyKey: `distribution_opportunity:${opp.id}`,
      subjectType: "distribution_opportunity",
      subjectId: opp.id,
      provider: "x",
      sentAs: account.handle,
      content: text,
    },
    { providerIsIdempotent: false },
  );

  let receipt: OutboundReceipt;
  try {
    const post = await createPost(account.accessToken, text);
    receipt = await completeReceipt(db, claim.id, { providerMessageId: post.id, url: post.url });
  } catch (err) {
    if (!(err instanceof AppError && err.details?.sent)) {
      await failReceipt(db, claim.id, err instanceof Error ? err.message : "post failed");
    }
    throw err;
  }

  await db
    .from("distribution_opportunities")
    .update({
      draft: text,
      approval_status: "approved",
      action_status: "published",
      outcome: "posted",
      published_url: receipt.url,
      updated_at: new Date().toISOString(),
    })
    .eq("id", opp.id);

  return { receipt, account: account.handle };
}
