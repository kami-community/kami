import { createHash } from "node:crypto";
import { AppError, upstreamFailed } from "@/lib/http/errors";
import type { CalendarEventReceipt, CalendarInvite, CalendarProvider } from "@/lib/ports/calendar";

/**
 * Google Calendar API v3 adapter (events.insert).
 *
 * - Auth: OAuth 2.0 refresh token for the founder's Google account
 *   (scope https://www.googleapis.com/auth/calendar.events).
 * - `sendUpdates=all` emails the invitation to every attendee.
 * - `conferenceDataVersion=1` + `conferenceData.createRequest` (type `hangoutsMeet`)
 *   attaches a Google Meet link; creation can be asynchronous (`status: pending`).
 * - A client-supplied event id (base32hex, 5–1024 chars) makes creation idempotent:
 *   a retry with the same key gets HTTP 409 and we return the existing event.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarId?: string;
}

interface GoogleEvent {
  id?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
}

/** Deterministic Google event id from an idempotency key: base32hex alphabet (0-9, a-v) only. */
export function googleEventId(idempotencyKey: string): string {
  const hex = createHash("sha256").update(`kami:${idempotencyKey}`).digest("hex");
  // Hex digits 0-9a-f are a subset of base32hex; prefix keeps ids recognisable.
  return `kami${hex.slice(0, 40)}`;
}

function toReceipt(event: GoogleEvent, invite: CalendarInvite): CalendarEventReceipt {
  if (!event.id) throw upstreamFailed("Google Calendar created no event id");
  const video =
    event.hangoutLink ??
    event.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri ??
    null;
  return {
    provider: "google_calendar",
    eventId: event.id,
    htmlLink: event.htmlLink ?? "",
    meetingLink: video,
    start: event.start?.dateTime ?? invite.start,
    end: event.end?.dateTime ?? invite.end,
  };
}

async function googleError(res: Response, what: string): Promise<AppError> {
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } | string };
  const message =
    typeof body.error === "string" ? body.error : (body.error?.message ?? `HTTP ${res.status}`);
  const details = { provider_status: res.status };
  if (res.status === 401) {
    return new AppError("unauthorized", `Google rejected the credentials (${what}): ${message}`);
  }
  if (res.status === 403) {
    return new AppError("forbidden", `Google refused ${what}: ${message}`, details);
  }
  return upstreamFailed(`Google Calendar ${what} failed: ${message}`, details);
}

export function createGoogleCalendarProvider(
  config: GoogleCalendarConfig,
  fetchImpl: typeof fetch = fetch,
): CalendarProvider {
  const calendarPath = `${CALENDAR_API}/calendars/${encodeURIComponent(config.calendarId ?? "primary")}/events`;

  async function request(url: string, init: RequestInit, what: string): Promise<Response> {
    try {
      return await fetchImpl(url, init);
    } catch (err) {
      throw upstreamFailed(
        `Could not reach Google (${what}): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async function accessToken(): Promise<string> {
    const res = await request(
      TOKEN_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          refresh_token: config.refreshToken,
          grant_type: "refresh_token",
        }),
      },
      "token refresh",
    );
    if (!res.ok) throw await googleError(res, "token refresh");
    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) throw upstreamFailed("Google token refresh returned no access token");
    return json.access_token;
  }

  return {
    id: "google_calendar",

    async createInvite(invite) {
      const token = await accessToken();
      const auth = { Authorization: `Bearer ${token}` };
      const eventId = googleEventId(invite.idempotencyKey);
      const qs = new URLSearchParams({
        sendUpdates: "all",
        conferenceDataVersion: invite.withVideoLink ? "1" : "0",
      });

      const res = await request(
        `${calendarPath}?${qs}`,
        {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({
            id: eventId,
            summary: invite.summary,
            description: invite.description,
            start: { dateTime: invite.start, timeZone: invite.timeZone },
            end: { dateTime: invite.end, timeZone: invite.timeZone },
            attendees: invite.attendees.map((a) => ({
              email: a.email,
              ...(a.name ? { displayName: a.name } : {}),
            })),
            ...(invite.withVideoLink
              ? {
                  conferenceData: {
                    createRequest: {
                      requestId: eventId,
                      conferenceSolutionKey: { type: "hangoutsMeet" },
                    },
                  },
                }
              : {}),
          }),
        },
        "event insert",
      );

      if (res.status === 409) {
        // Same idempotency key already created this event: return it instead of a duplicate.
        const existing = await request(
          `${calendarPath}/${encodeURIComponent(eventId)}`,
          { headers: auth },
          "event lookup",
        );
        if (!existing.ok) throw await googleError(existing, "event lookup");
        return toReceipt((await existing.json()) as GoogleEvent, invite);
      }
      if (!res.ok) throw await googleError(res, "event insert");
      return toReceipt((await res.json()) as GoogleEvent, invite);
    },
  };
}
