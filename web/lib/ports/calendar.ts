/**
 * Calendar provider port. Services depend on this interface; vendor details
 * (Google Calendar today) live in `lib/adapters/*`.
 */

export interface CalendarInvite {
  /**
   * Stable per logical invite (e.g. the meeting id). Providers use it to make
   * creation idempotent, so a retry returns the original event.
   */
  idempotencyKey: string;
  summary: string;
  description?: string;
  /** RFC 3339 instant, e.g. 2026-10-07T15:00:00.000Z */
  start: string;
  end: string;
  /** IANA time zone the founder chose the slot in, e.g. "Europe/Berlin". */
  timeZone: string;
  attendees: { email: string; name?: string }[];
  /** Attach a video link (Google Meet for Google Calendar). */
  withVideoLink: boolean;
}

export interface CalendarEventReceipt {
  provider: string;
  /** Provider-assigned event id. Always present — an invite without one is treated as failed. */
  eventId: string;
  htmlLink: string;
  /** Video link when one was created (may arrive later for asynchronous conference creation). */
  meetingLink: string | null;
  start: string;
  end: string;
}

export interface CalendarProvider {
  readonly id: string;
  /** Create the event and email the invitation to every attendee. */
  createInvite(invite: CalendarInvite): Promise<CalendarEventReceipt>;
}
