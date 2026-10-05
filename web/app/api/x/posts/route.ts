import { z } from "zod";
import { getMe, getUserPosts } from "@/lib/adapters/x/api";
import { requireConnection } from "@/lib/connections/service";
import { db } from "@/lib/db/client";
import { ids, parseQuery, route } from "@/lib/http/route";

const Query = z.object({ session_id: ids.sessionId });

/** Recent posts from the campaign's connected X account. */
export const GET = route(async (request) => {
  const { session_id } = parseQuery(request, Query);
  const account = await requireConnection(db(), session_id, "x");
  const me = await getMe(account.accessToken);
  return Response.json({
    posts: await getUserPosts(account.accessToken, me.id),
    account: account.handle,
  });
});
