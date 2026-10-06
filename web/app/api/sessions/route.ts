import { z } from "zod";
import { createCampaign, listCampaigns } from "@/lib/campaigns/sessions";
import { db } from "@/lib/db/client";
import { parseBody, route } from "@/lib/http/route";

export const maxDuration = 120;

const Body = z.object({
  domain: z.string().trim().min(3).max(253),
  goals: z.array(z.string().trim().min(1).max(60)).max(8).default([]),
  stage: z.string().trim().max(60).nullable().default(null),
});

/** Start a campaign: validate the founder's domain, research it, open a session. */
export const POST = route(async (request) => {
  const input = await parseBody(request, Body);
  const session = await createCampaign(db(), input);
  return Response.json({ session }, { status: 201 });
});

/** Every campaign on this install (single-user Community Edition). */
export const GET = route(async () => Response.json({ campaigns: await listCampaigns(db()) }));
