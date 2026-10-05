const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export function calendarConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET && REFRESH_TOKEN);
}

async function getAccessToken(): Promise<string> {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error("Google Calendar not configured");
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    throw new Error(`Google token refresh ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return json.access_token;
}

export interface CalendarEventParams {
  summary: string;
  description?: string;
  start: string;
  end: string;
  attendees?: string[];
}

export interface CalendarEventResult {
  event_id: string;
  html_link: string;
}

export async function createCalendarEvent(
  params: CalendarEventParams,
): Promise<CalendarEventResult> {
  const token = await getAccessToken();
  const res = await fetch(`${CALENDAR_API}/calendars/primary/events?sendUpdates=all`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: params.summary,
      description: params.description,
      start: { dateTime: params.start, timeZone: "UTC" },
      end: { dateTime: params.end, timeZone: "UTC" },
      attendees: (params.attendees ?? []).map((email) => ({ email })),
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Google Calendar ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  }
  return { event_id: json.id, html_link: json.htmlLink };
}
