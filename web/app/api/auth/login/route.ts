import { z } from "zod";
import { ADMIN_COOKIE, adminCookieValue, safeEqual } from "@/lib/auth/access";
import { env } from "@/lib/config/env";
import { AppError, notConfigured } from "@/lib/http/errors";
import { parseBody, route } from "@/lib/http/route";

const Body = z.object({ token: z.string().min(1) });
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export const POST = route(async (request) => {
  const { KAMI_ADMIN_TOKEN, NODE_ENV } = env();
  if (!KAMI_ADMIN_TOKEN)
    throw notConfigured("KAMI_ADMIN_TOKEN is not set; sign-in is not required");

  const { token } = await parseBody(request, Body);
  if (!safeEqual(token, KAMI_ADMIN_TOKEN)) throw new AppError("unauthorized", "invalid token");

  const cookie = [
    `${ADMIN_COOKIE}=${await adminCookieValue(KAMI_ADMIN_TOKEN)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${THIRTY_DAYS}`,
    ...(NODE_ENV === "production" ? ["Secure"] : []),
  ].join("; ");
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } });
});

export const DELETE = route(async () => {
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` } },
  );
});
