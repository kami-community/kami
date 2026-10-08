import { z } from "zod";
import { calendarProvider } from "@/lib/providers";
import type { Db } from "@/lib/db/client";
import {
  AppError,
  badRequest,
  conflict,
  forbidden,
  notConfigured,
  notFound,
} from "@/lib/http/errors";
import { ids } from "@/lib/http/route";
import { assertNotPaused, assertNotSuppressed } from "@/lib/outbound/policy";
import type { CalendarProvider } from "@/lib/ports/calendar";
import type { Meeting } from "@/lib/salesTypes";

/**
 * Sales meetings: propose → schedule (calendar invite) → scheduled.
 * The attendee is always an existing contact of the session (never free text),
 * and `scheduled` is only written together with the provider's event id.
 */

export const MEETING_DURATIONS = [15, 30, 45, 60] as const;
/** A claim older than this is considered abandoned (process died mid-call) and may be retried. */
const STALE_CLAIM_MS = 5 * 60_000;

function isIanaTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const ProposeMeetingInput = z.object({
  action: z.literal("propose"),
  session_id: ids.sessionId,
  account_id: ids.uuid.optional(),
  contact_id: ids.uuid.optional(),
  conversation_id: ids.uuid.optional(),
  title: z.string().trim().min(1).max(200).default("Discovery call"),
});
export type ProposeMeetingInput = z.infer<typeof ProposeMeetingInput>;

export const ScheduleMeetingInput = z.object({
  action: z.literal("schedule"),
  session_id: ids.sessionId,
  meeting_id: ids.uuid,
  contact_id: ids.uuid,
  /** RFC 3339 instant with offset, computed in the founder's browser from datetime-local. */
  start: z.iso.datetime({ offset: true }),
  time_zone: z.string().refine(isIanaTimeZone, "time_zone must be an IANA time zone"),
  duration_minutes: z
    .number()
    .int()
    .refine((v) => (MEETING_DURATIONS as readonly number[]).includes(v), {
      message: `duration_minutes must be one of ${MEETING_DURATIONS.join(", ")}`,
    })
    .default(30),
  video_link: z.boolean().default(true),
});
export type ScheduleMeetingInput = z.infer<typeof ScheduleMeetingInput>;

export const MeetingAction = z.discriminatedUnion("action", [
  ProposeMeetingInput,
  ScheduleMeetingInput,
]);

export interface MeetingContact {
  id: string;
  account_id: string | null;
  name: string | null;
  title: string | null;
  email: string;
  email_verification: string | null;
}

function toMeeting(row: Record<string, unknown>): Meeting {
  const opt = (k: string) => (row[k] == null ? undefined : (row[k] as string));
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    account_id: opt("account_id"),
    contact_id: opt("contact_id"),
    conversation_id: opt("conversation_id"),
    title: opt("title"),
    status: row.status as Meeting["status"],
    proposed_at: opt("proposed_at"),
    scheduled_at: opt("scheduled_at"),
    ends_at: opt("ends_at"),
    time_zone: opt("time_zone"),
    attendee_email: opt("attendee_email"),
    meeting_link: opt("meeting_link"),
    last_error: opt("last_error"),
    calendar_event_id: opt("calendar_event_id"),
    provider_receipt: (row.provider_receipt as Record<string, unknown> | null) ?? undefined,
    created_at: opt("created_at"),
    updated_at: opt("updated_at"),
  };
}

/** Meetings plus the contacts an invite may go to (session contacts with an email). */
export async function listMeetings(
  db: Db,
  sessionId: string,
): Promise<{ meetings: Meeting[]; contacts: MeetingContact[] }> {
  const [meetings, contacts] = await Promise.all([
    db
      .from("sales_meetings")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("sales_contacts")
      .select("id, account_id, name, title, email, email_verification")
      .eq("session_id", sessionId)
      .eq("do_not_contact", false)
      .not("email", "is", null)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  if (meetings.error) throw new AppError("internal", meetings.error.message);
  if (contacts.error) throw new AppError("internal", contacts.error.message);
  return {
    meetings: (meetings.data ?? []).map(toMeeting),
    contacts: (contacts.data ?? []) as MeetingContact[],
  };
}

async function assertBelongsToSession(db: Db, table: string, id: string, sessionId: string) {
  const { data, error } = await db
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw new AppError("internal", error.message);
  if (!data)
    throw notFound(`${table.replace(/^sales_/, "").replace(/s$/, "")} not found for this campaign`);
}

export async function proposeMeeting(db: Db, input: ProposeMeetingInput): Promise<Meeting> {
  const sessionId = input.session_id;
  if (input.account_id)
    await assertBelongsToSession(db, "sales_accounts", input.account_id, sessionId);
  if (input.contact_id)
    await assertBelongsToSession(db, "sales_contacts", input.contact_id, sessionId);
  if (input.conversation_id) {
    await assertBelongsToSession(db, "sales_conversations", input.conversation_id, sessionId);
  }

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("sales_meetings")
    .insert({
      session_id: sessionId,
      account_id: input.account_id ?? null,
      contact_id: input.contact_id ?? null,
      conversation_id: input.conversation_id ?? null,
      title: input.title,
      status: "proposed",
      proposed_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) throw new AppError("internal", error.message);

  if (input.account_id) {
    const stage = await db
      .from("sales_accounts")
      .update({ pipeline_stage: "meeting_proposed", updated_at: now })
      .eq("id", input.account_id)
      .eq("session_id", sessionId)
      .in("pipeline_stage", ["qualified", "engaged"]);
    if (stage.error) throw new AppError("internal", stage.error.message);
  }
  return toMeeting(data);
}

/**
 * Send a calendar invite for a proposed meeting to one of the session's contacts.
 * Gates: meeting + contact in this session → contact has an email and is not
 * do-not-contact → session not paused → recipient not suppressed → claim → provider call.
 */
export async function scheduleMeeting(
  db: Db,
  input: ScheduleMeetingInput,
  calendar: CalendarProvider | null = calendarProvider(),
  now: Date = new Date(),
): Promise<Meeting> {
  const sessionId = input.session_id;

  const { data: meeting, error: meetingErr } = await db
    .from("sales_meetings")
    .select("*")
    .eq("id", input.meeting_id)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (meetingErr) throw new AppError("internal", meetingErr.message);
  if (!meeting) throw notFound("meeting not found for this campaign");
  if (meeting.status === "scheduled") throw conflict("this meeting is already scheduled");
  if (meeting.status !== "proposed" && meeting.status !== "scheduling") {
    throw conflict(`meeting is ${meeting.status} — only proposed meetings can be scheduled`);
  }

  const { data: contact, error: contactErr } = await db
    .from("sales_contacts")
    .select("id, account_id, name, email, do_not_contact")
    .eq("id", input.contact_id)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (contactErr) throw new AppError("internal", contactErr.message);
  if (!contact) throw notFound("contact not found for this campaign");
  const email = (contact.email as string | null)?.trim().toLowerCase();
  if (!email) throw badRequest("this contact has no email address — Kami never invents one");
  if (contact.do_not_contact) throw forbidden(`${email} is marked do-not-contact`);
  if (meeting.account_id && contact.account_id && meeting.account_id !== contact.account_id) {
    throw badRequest("the contact belongs to a different account than this meeting");
  }

  const start = new Date(input.start);
  if (start.getTime() <= now.getTime()) throw badRequest("pick a time in the future");
  const end = new Date(start.getTime() + input.duration_minutes * 60_000);

  await assertNotPaused(db, sessionId, "sales");
  await assertNotSuppressed(db, { sessionId, channel: "email", recipient: email });
  if (!calendar) {
    throw notConfigured(
      "Google Calendar is not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)",
    );
  }

  // Claim: proposed → scheduling. A stale claim (crashed mid-call) may be retried;
  // the provider call is idempotent per key, so a retry never double-invites.
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS).toISOString();
  const claimed = await db
    .from("sales_meetings")
    .update({ status: "scheduling", last_error: null, updated_at: now.toISOString() })
    .eq("id", meeting.id)
    .eq("session_id", sessionId)
    .or(`status.eq.proposed,and(status.eq.scheduling,updated_at.lt."${staleBefore}")`)
    .select("id");
  if (claimed.error) throw new AppError("internal", claimed.error.message);
  if (!claimed.data?.length) {
    throw conflict("an invite for this meeting is already being sent — refresh in a moment");
  }

  const title = (meeting.title as string | null) ?? "Discovery call";
  let receipt;
  try {
    receipt = await calendar.createInvite({
      idempotencyKey: `sales_meeting:${meeting.id}:${start.toISOString()}`,
      summary: title,
      description: `Scheduled by Kami for ${contact.name ?? email}.`,
      start: start.toISOString(),
      end: end.toISOString(),
      timeZone: input.time_zone,
      attendees: [{ email, name: (contact.name as string | null) ?? undefined }],
      withVideoLink: input.video_link,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "calendar invite failed";
    const revert = await db
      .from("sales_meetings")
      .update({
        status: "proposed",
        last_error: message.slice(0, 1000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", meeting.id);
    if (revert.error)
      console.error("[meetings] could not release claim", meeting.id, revert.error.message);
    throw err;
  }

  const updatedAt = new Date().toISOString();
  const { data: updated, error: updateErr } = await db
    .from("sales_meetings")
    .update({
      status: "scheduled",
      contact_id: contact.id,
      attendee_email: email,
      scheduled_at: receipt.start,
      ends_at: receipt.end,
      time_zone: input.time_zone,
      calendar_event_id: receipt.eventId,
      meeting_link: receipt.meetingLink,
      provider_receipt: {
        provider: receipt.provider,
        event_id: receipt.eventId,
        html_link: receipt.htmlLink,
        meeting_link: receipt.meetingLink,
        attendee: email,
      },
      last_error: null,
      updated_at: updatedAt,
    })
    .eq("id", meeting.id)
    .select("*")
    .single();
  if (updateErr) {
    // The invite went out; surface loudly so the founder does not send another.
    throw new AppError("internal", `invite sent, but recording it failed: ${updateErr.message}`, {
      sent: true,
      calendar_event_id: receipt.eventId,
    });
  }

  // Follow-on bookkeeping: the invite is already out, so failures are logged, not thrown.
  if (meeting.account_id) {
    const stage = await db
      .from("sales_accounts")
      .update({ pipeline_stage: "invited", updated_at: updatedAt })
      .eq("id", meeting.account_id)
      .eq("session_id", sessionId)
      .in("pipeline_stage", ["meeting_proposed", "qualified", "engaged"]);
    if (stage.error) console.error("[meetings] pipeline stage update failed", stage.error.message);
  }
  const note = await db.from("sales_notifications").insert({
    session_id: sessionId,
    kind: "meeting",
    title: "Calendar invite sent",
    body: `${title} → ${email}`,
    entity_type: "sales_meeting",
    entity_id: meeting.id,
  });
  if (note.error) console.error("[meetings] notification insert failed", note.error.message);

  return toMeeting(updated);
}
