import type { Db } from "@/lib/db/client";
import { AppError } from "@/lib/http/errors";

/**
 * Where a campaign stands, derived from stored rows (never from browser
 * memory): which gated Sales steps are complete, what is waiting on the
 * founder, and how far distribution has got. The workspace sidebar and step
 * navigation render from this, so a reload lands the founder where they were.
 */

export type SalesStep = "segments" | "plan" | "find" | "emails" | "needs";

export interface CampaignProgress {
  dossierConfirmed: boolean;
  paused: boolean;
  sales: {
    configured: boolean;
    paused: boolean;
    segmentsConfirmed: boolean;
    planStatus: "none" | "draft" | "approved";
    accounts: number;
    includedAccounts: number;
    drafts: { pending: number; approved: number; sent: number };
    needsYou: { replies: number; meetings: number; tasks: number; total: number };
    /** the step a founder should land on */
    nextStep: SalesStep;
    /** steps whose gate is satisfied */
    done: Record<SalesStep, boolean>;
  };
  marketing: {
    planStatus: "none" | "proposed" | "approved";
    paused: boolean;
    opportunities: { needsReview: number; approved: number; published: number };
  };
  outbound: { sent: number; failed: number; lastSentAt: string | null };
}

type Rows<T> = { data: T[] | null; error: { message: string } | null };

function rows<T>(result: Rows<T>, what: string): T[] {
  if (result.error)
    throw new AppError("internal", `could not load ${what}: ${result.error.message}`);
  return result.data ?? [];
}

export function nextSalesStep(p: {
  segmentsConfirmed: boolean;
  planApproved: boolean;
  sequencesCreated: boolean;
  hasSent: boolean;
}): SalesStep {
  if (!p.segmentsConfirmed) return "segments";
  if (!p.planApproved) return "plan";
  if (p.hasSent) return "needs";
  if (p.sequencesCreated) return "emails";
  return "find";
}

export async function getCampaignProgress(db: Db, sessionId: string): Promise<CampaignProgress> {
  const [
    session,
    sales,
    plans,
    accounts,
    touchpoints,
    notifications,
    meetings,
    tasks,
    dist,
    opps,
    receipts,
  ] = await Promise.all([
    db
      .from("agent_sessions")
      .select("id, paused, dossier_confirmed_at")
      .eq("id", sessionId)
      .maybeSingle(),
    db
      .from("sales_campaigns")
      .select("segments_confirmed_at, autonomous_paused")
      .eq("session_id", sessionId)
      .maybeSingle(),
    db.from("sales_plans").select("status, version").eq("session_id", sessionId),
    db.from("sales_accounts").select("id, pipeline_stage, notes").eq("session_id", sessionId),
    db.from("sales_touchpoints").select("status, sent_at").eq("session_id", sessionId),
    db.from("sales_notifications").select("kind, read").eq("session_id", sessionId),
    db.from("sales_meetings").select("status").eq("session_id", sessionId),
    db.from("sales_tasks").select("status").eq("session_id", sessionId),
    db
      .from("distribution_campaigns")
      .select("status, autonomous_paused")
      .eq("session_id", sessionId)
      .maybeSingle(),
    db
      .from("distribution_opportunities")
      .select("approval_status, action_status, agent_skill")
      .eq("session_id", sessionId),
    db.from("outbound_receipts").select("status, sent_at").eq("session_id", sessionId),
  ]);

  if (session.error)
    throw new AppError("internal", `could not load campaign: ${session.error.message}`);
  if (!session.data) throw new AppError("not_found", "campaign not found");

  const salesRow = sales.data as {
    segments_confirmed_at: string | null;
    autonomous_paused: boolean;
  } | null;
  const planRows = rows(plans as Rows<{ status: string; version: number }>, "plans");
  const latestPlan = [...planRows].sort((a, b) => b.version - a.version)[0];
  const accountRows = rows(
    accounts as Rows<{ id: string; pipeline_stage: string; notes: string | null }>,
    "accounts",
  );
  const tpRows = rows(touchpoints as Rows<{ status: string; sent_at: string | null }>, "drafts");
  const notifRows = rows(notifications as Rows<{ kind: string; read: boolean }>, "notifications");
  const meetingRows = rows(meetings as Rows<{ status: string }>, "meetings");
  const taskRows = rows(tasks as Rows<{ status: string }>, "tasks");
  const distRow = dist.data as { status: string; autonomous_paused: boolean } | null;
  // starter templates are not research: they never count as work waiting on the founder
  const oppRows = rows(
    opps as Rows<{ approval_status: string; action_status: string; agent_skill: string | null }>,
    "opportunities",
  ).filter((o) => o.agent_skill !== "scaffold");
  const receiptRows = rows(
    receipts as Rows<{ status: string; sent_at: string | null }>,
    "receipts",
  );

  const sentDrafts = tpRows.filter((t) => t.sent_at || t.status === "sent").length;
  const approvedDrafts = tpRows.filter((t) => t.status === "approved").length;
  const pendingDrafts = tpRows.length - sentDrafts - approvedDrafts;
  const replies = notifRows.filter((n) => !n.read).length;
  const proposedMeetings = meetingRows.filter((m) => m.status === "proposed").length;
  const openTasks = taskRows.filter(
    (t) => t.status === "open" || t.status === "in_progress",
  ).length;

  const segmentsConfirmed = Boolean(salesRow?.segments_confirmed_at);
  const planStatus: CampaignProgress["sales"]["planStatus"] = !latestPlan
    ? "none"
    : latestPlan.status === "approved"
      ? "approved"
      : "draft";
  const sequencesCreated = tpRows.length > 0;
  const hasSent = sentDrafts > 0;

  const sentReceipts = receiptRows.filter((r) => r.status === "sent");
  const lastSentAt =
    sentReceipts
      .map((r) => r.sent_at)
      .filter((s): s is string => Boolean(s))
      .sort()
      .at(-1) ?? null;

  return {
    dossierConfirmed: Boolean(
      (session.data as { dossier_confirmed_at: string | null }).dossier_confirmed_at,
    ),
    paused: Boolean((session.data as { paused: boolean }).paused),
    sales: {
      configured: Boolean(salesRow),
      paused: Boolean(salesRow?.autonomous_paused),
      segmentsConfirmed,
      planStatus,
      accounts: accountRows.length,
      includedAccounts: accountRows.filter(
        (a) =>
          (a.pipeline_stage === "ready_for_approval" || a.pipeline_stage === "sequencing") &&
          !a.notes?.includes("excluded_from_cohort"),
      ).length,
      drafts: { pending: Math.max(0, pendingDrafts), approved: approvedDrafts, sent: sentDrafts },
      needsYou: {
        replies,
        meetings: proposedMeetings,
        tasks: openTasks,
        total: replies + proposedMeetings + openTasks,
      },
      nextStep: nextSalesStep({
        segmentsConfirmed,
        planApproved: planStatus === "approved",
        sequencesCreated,
        hasSent,
      }),
      done: {
        segments: segmentsConfirmed,
        plan: planStatus === "approved",
        find: sequencesCreated,
        emails: hasSent,
        needs: hasSent,
      },
    },
    marketing: {
      planStatus: !distRow ? "none" : distRow.status === "approved" ? "approved" : "proposed",
      paused: Boolean(distRow?.autonomous_paused),
      opportunities: {
        needsReview: oppRows.filter((o) => o.approval_status === "needs_review").length,
        approved: oppRows.filter(
          (o) => o.approval_status === "approved" && o.action_status !== "published",
        ).length,
        published: oppRows.filter(
          (o) => o.action_status === "published" || o.action_status === "posted_manual",
        ).length,
      },
    },
    outbound: {
      sent: sentReceipts.length,
      failed: receiptRows.filter((r) => r.status === "failed").length,
      lastSentAt,
    },
  };
}
