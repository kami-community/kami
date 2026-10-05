import { z } from "zod";
import { db } from "@/lib/db/client";
import { ids, parseBody, route } from "@/lib/http/route";
import { addFounderContact } from "@/lib/sales/contacts";

const Body = z.object({
  session_id: ids.sessionId,
  account_id: ids.uuid,
  name: z.string().trim().max(200).optional(),
  email: z.string().trim().email("enter a valid email address").max(320),
});

/** The founder adds a contact email by hand (stored as `founder_provided`). */
export const POST = route(async (request) => {
  const body = await parseBody(request, Body);
  return Response.json(
    await addFounderContact(db(), {
      sessionId: body.session_id,
      accountId: body.account_id,
      email: body.email,
      name: body.name,
    }),
  );
});
