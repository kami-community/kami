import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, parseQuery, route } from "@/lib/http/route";
import {
  calendarProviderOrNull,
  listMeetings,
  MeetingAction,
  proposeMeeting,
  scheduleMeeting,
} from "@/lib/sales/meetings";

const Query = z.object({ session_id: ids.sessionId });

/** Meetings for this campaign, the contacts an invite can go to, and calendar availability. */
export const GET = route(async (request) => {
  const { session_id } = parseQuery(request, Query);
  return Response.json({
    ...(await listMeetings(db(), session_id)),
    calendar_configured: calendarProviderOrNull() !== null,
  });
});

/** `propose` a meeting, or `schedule` one: send a real calendar invite to a stored contact. */
export const POST = route(async (request) => {
  const input = await parseBody(request, MeetingAction);
  if (input.action === "propose") {
    return Response.json({ meeting: await proposeMeeting(db(), input) });
  }
  return Response.json({ scheduled: true, meeting: await scheduleMeeting(db(), input) });
});
