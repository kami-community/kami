import { db } from "@/lib/db/client";
import { route } from "@/lib/http/route";
import { pollEmailReplies } from "@/lib/inbound/pollEmail";
import { emailProvider } from "@/lib/providers";

/** Job: pull recent inbound email and record replies to Kami outreach. */
export const POST = route(async () => {
  return Response.json(await pollEmailReplies(db(), emailProvider()));
});
