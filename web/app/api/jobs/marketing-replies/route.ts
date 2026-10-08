import { db } from "@/lib/db/client";
import { route } from "@/lib/http/route";
import { pollMarketingReplies } from "@/lib/marketing/conversationReplies";

/** Job: pull X DM replies for active marketing conversations and flag stalled ones. */
export const POST = route(async () => Response.json(await pollMarketingReplies(db())));
