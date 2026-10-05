import { supabaseServer } from "@/lib/supabase";
import { calendarConfigured, createCalendarEvent } from "@/lib/googleCalendar";
import type { Meeting, MeetingStatus } from "@/lib/salesTypes";

function rowToMeeting(row: Record<string, unknown>): Meeting {
  return {
    id: row.id as string,
    session_id: row.session_id as string,
    account_id: row.account_id as string | undefined,
    contact_id: row.contact_id as string | undefined,
    conversation_id: row.conversation_id as string | undefined,
    title: row.title as string | undefined,
    status: row.status as MeetingStatus,
    proposed_at: row.proposed_at as string | undefined,
    scheduled_at: row.scheduled_at as string | undefined,
    calendar_event_id: row.calendar_event_id as string | undefined,
    provider_receipt: row.provider_receipt as Record<string, unknown> | undefined,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

export async function GET(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ meetings: [] });

  const sessionId = new URL(request.url).searchParams.get("session_id");
  if (!sessionId) return Response.json({ meetings: [] });

  const { data, error } = await sb
    .from("sales_meetings")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ meetings: (data ?? []).map(rowToMeeting) });
}

export async function POST(request: Request): Promise<Response> {
  const sb = supabaseServer();
  if (!sb) return Response.json({ error: "supabase not configured" }, { status: 503 });

  const body = await request.json();

  if (body.action === "invite") {
    const { meeting_id, attendee_email, slot } = body as {
      meeting_id: string;
      attendee_email: string;
      slot: string;
    };

    if (!meeting_id || !attendee_email?.includes("@") || !slot) {
      return Response.json(
        { error: "meeting_id, attendee_email, and slot required" },
        { status: 400 },
      );
    }

    if (!calendarConfigured()) {
      return Response.json({ error: "Google Calendar not configured" }, { status: 503 });
    }

    const { data: meeting } = await sb
      .from("sales_meetings")
      .select("*")
      .eq("id", meeting_id)
      .maybeSingle();
    if (!meeting) return Response.json({ error: "meeting not found" }, { status: 404 });
    if (meeting.status !== "proposed") {
      return Response.json(
        { error: `meeting status is ${meeting.status}, expected proposed` },
        { status: 400 },
      );
    }

    const start = new Date(slot);
    if (Number.isNaN(start.getTime())) {
      return Response.json({ error: "invalid slot ISO datetime" }, { status: 400 });
    }

    const end = new Date(start.getTime() + 30 * 60 * 1000).toISOString();
    const title = meeting.title ?? "Sales meeting";

    try {
      const result = await createCalendarEvent({
        summary: title,
        description: `Sales meeting invite for ${attendee_email}`,
        start: start.toISOString(),
        end,
        attendees: [attendee_email.trim()],
      });

      const now = new Date().toISOString();
      const { data: updated, error } = await sb
        .from("sales_meetings")
        .update({
          status: "invited",
          scheduled_at: start.toISOString(),
          calendar_event_id: result.event_id,
          provider_receipt: { html_link: result.html_link, attendee: attendee_email },
          updated_at: now,
        })
        .eq("id", meeting_id)
        .select("*")
        .single();

      if (error) return Response.json({ error: error.message }, { status: 500 });

      if (meeting.account_id) {
        await sb
          .from("sales_accounts")
          .update({ pipeline_stage: "invited", updated_at: now })
          .eq("id", meeting.account_id)
          .in("pipeline_stage", ["meeting_proposed", "qualified"]);
      }

      await sb.from("sales_notifications").insert({
        session_id: meeting.session_id,
        kind: "meeting",
        title: "Calendar invite sent",
        body: `${title} → ${attendee_email}`,
        entity_type: "sales_meeting",
        entity_id: meeting_id,
      });

      return Response.json({ invited: true, meeting: rowToMeeting(updated) });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "calendar invite failed";
      return Response.json({ error: msg }, { status: 502 });
    }
  }

  const { session_id, account_id, contact_id, conversation_id, title } = body as {
    session_id: string;
    account_id?: string;
    contact_id?: string;
    conversation_id?: string;
    title?: string;
  };

  if (!session_id) return Response.json({ error: "session_id required" }, { status: 400 });

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("sales_meetings")
    .insert({
      session_id,
      account_id: account_id ?? null,
      contact_id: contact_id ?? null,
      conversation_id: conversation_id ?? null,
      title: title ?? "Discovery call",
      status: "proposed",
      proposed_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (account_id) {
    await sb
      .from("sales_accounts")
      .update({ pipeline_stage: "meeting_proposed", updated_at: now })
      .eq("id", account_id)
      .in("pipeline_stage", ["qualified", "engaged"]);
  }

  return Response.json({ meeting: rowToMeeting(data) });
}
