import { describe, expect, it, vi } from "vitest";
import { upstreamFailed } from "@/lib/http/errors";
import type { CalendarProvider } from "@/lib/ports/calendar";
import { fakeDb } from "@/lib/testing/fakeDb";
import { listMeetings, scheduleMeeting, ScheduleMeetingInput } from "./meetings";

const SESSION = "6f1c1d0e-2a51-4f6b-9a8e-0d1f0c9b7a11";
const OTHER_SESSION = "0b8e1f2c-3d4a-4b5c-8d6e-7f8091a2b3c4";
const MEETING = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const ACCOUNT = "11111111-2222-4333-8444-555555555555";
const CONTACT = "99999999-8888-4777-8666-555555555555";
const FOREIGN_CONTACT = "12121212-3434-4565-8787-909090909090";
const NOW = new Date("2026-10-06T12:00:00.000Z");

function setup(opts: { salesPaused?: boolean; contactEmail?: string | null; dnc?: boolean } = {}) {
  return fakeDb({
    agent_sessions: [{ id: SESSION, paused: false }],
    sales_campaigns: [{ session_id: SESSION, autonomous_paused: Boolean(opts.salesPaused) }],
    suppressions: [],
    sales_meetings: [
      {
        id: MEETING,
        session_id: SESSION,
        account_id: ACCOUNT,
        title: "Discovery call",
        status: "proposed",
        updated_at: NOW.toISOString(),
      },
    ],
    sales_contacts: [
      {
        id: CONTACT,
        session_id: SESSION,
        account_id: ACCOUNT,
        name: "Jordan",
        email: opts.contactEmail === undefined ? "Jordan@Acme.com" : opts.contactEmail,
        do_not_contact: Boolean(opts.dnc),
      },
      {
        id: FOREIGN_CONTACT,
        session_id: OTHER_SESSION,
        account_id: null,
        name: "Elsewhere",
        email: "x@other.com",
        do_not_contact: false,
      },
    ],
    sales_accounts: [{ id: ACCOUNT, session_id: SESSION, pipeline_stage: "meeting_proposed" }],
    sales_notifications: [],
  });
}

function calendar(fail = false): CalendarProvider & { createInvite: ReturnType<typeof vi.fn> } {
  return {
    id: "google_calendar",
    createInvite: vi.fn(async (invite) => {
      if (fail) throw upstreamFailed("Google Calendar event insert failed: quota");
      return {
        provider: "google_calendar",
        eventId: "kamiabc123",
        htmlLink: "https://calendar.google.com/event?eid=abc",
        meetingLink: "https://meet.google.com/abc-defg-hij",
        start: invite.start,
        end: invite.end,
      };
    }),
  };
}

const input = (over: Record<string, unknown> = {}) =>
  ScheduleMeetingInput.parse({
    action: "schedule",
    session_id: SESSION,
    meeting_id: MEETING,
    contact_id: CONTACT,
    start: "2026-10-07T15:00:00+02:00",
    time_zone: "Europe/Berlin",
    ...over,
  });

describe("ScheduleMeetingInput", () => {
  it("rejects free-text attendees, bad zones and naive datetimes", () => {
    expect(() => input({ contact_id: "jordan@acme.com" })).toThrow();
    expect(() => input({ time_zone: "Mars/Olympus" })).toThrow(/IANA/);
    expect(() => input({ start: "2026-10-07T15:00" })).toThrow();
    expect(() => input({ duration_minutes: 17 })).toThrow();
  });
});

describe("scheduleMeeting", () => {
  it("sends a real invite to the stored contact and records the provider receipt", async () => {
    const { db, tables } = setup();
    const cal = calendar();
    const meeting = await scheduleMeeting(db, input(), cal, NOW);

    expect(cal.createInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        start: "2026-10-07T13:00:00.000Z",
        end: "2026-10-07T13:30:00.000Z",
        timeZone: "Europe/Berlin",
        attendees: [{ email: "jordan@acme.com", name: "Jordan" }],
        idempotencyKey: `sales_meeting:${MEETING}:2026-10-07T13:00:00.000Z`,
      }),
    );
    expect(meeting).toMatchObject({
      status: "scheduled",
      calendar_event_id: "kamiabc123",
      attendee_email: "jordan@acme.com",
      meeting_link: "https://meet.google.com/abc-defg-hij",
    });
    expect(tables.sales_accounts[0].pipeline_stage).toBe("invited");
    expect(tables.sales_notifications).toHaveLength(1);
  });

  it("only invites contacts of this session", async () => {
    const { db } = setup();
    const cal = calendar();
    await expect(
      scheduleMeeting(db, input({ contact_id: FOREIGN_CONTACT }), cal, NOW),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(cal.createInvite).not.toHaveBeenCalled();
  });

  it("never invents an email and respects do-not-contact", async () => {
    await expect(
      scheduleMeeting(setup({ contactEmail: null }).db, input(), calendar(), NOW),
    ).rejects.toMatchObject({ code: "bad_request" });
    await expect(
      scheduleMeeting(setup({ dnc: true }).db, input(), calendar(), NOW),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("refuses while sales is paused or the slot is in the past", async () => {
    await expect(
      scheduleMeeting(setup({ salesPaused: true }).db, input(), calendar(), NOW),
    ).rejects.toMatchObject({ code: "paused" });
    await expect(
      scheduleMeeting(setup().db, input({ start: "2026-10-01T09:00:00Z" }), calendar(), NOW),
    ).rejects.toMatchObject({ code: "bad_request" });
  });

  it("returns not_configured without a calendar and leaves the meeting proposed", async () => {
    const { db, tables } = setup();
    await expect(scheduleMeeting(db, input(), null, NOW)).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(tables.sales_meetings[0].status).toBe("proposed");
  });

  it("releases the claim on a provider failure, and blocks an in-flight duplicate", async () => {
    const { db, tables } = setup();
    await expect(scheduleMeeting(db, input(), calendar(true), NOW)).rejects.toMatchObject({
      code: "upstream_failed",
    });
    expect(tables.sales_meetings[0]).toMatchObject({ status: "proposed" });
    expect(String(tables.sales_meetings[0].last_error)).toMatch(/quota/);

    tables.sales_meetings[0].status = "scheduling";
    tables.sales_meetings[0].updated_at = NOW.toISOString();
    const cal = calendar();
    await expect(scheduleMeeting(db, input(), cal, NOW)).rejects.toMatchObject({
      code: "conflict",
    });
    expect(cal.createInvite).not.toHaveBeenCalled();

    // A stale claim (process died mid-call) can be retried; the provider call is idempotent.
    tables.sales_meetings[0].updated_at = "2026-10-06T11:00:00.000Z";
    expect((await scheduleMeeting(db, input(), cal, NOW)).status).toBe("scheduled");
  });

  it("lists only this session's meetings and contacts", async () => {
    const { db } = setup();
    const { meetings, contacts } = await listMeetings(db, SESSION);
    expect(meetings.map((m) => m.id)).toEqual([MEETING]);
    expect(contacts.map((c) => c.id)).toEqual([CONTACT]);
  });
});
