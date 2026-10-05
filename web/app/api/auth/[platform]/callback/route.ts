import { z } from "zod";
import { clearPendingOAuthCookie, readPendingOAuth } from "@/lib/connections/oauthCookie";
import { OAUTH_PROVIDERS } from "@/lib/connections/providers";
import { saveConnection } from "@/lib/connections/service";
import { safeEqual } from "@/lib/auth/access";
import { db } from "@/lib/db/client";
import { route } from "@/lib/http/route";

const Params = z.object({ platform: z.enum(["x", "instagram"]) });

/** OAuth redirect target: exchange the code, store the sealed tokens, return to the app. */
export const GET = route<{ params: Promise<{ platform: string }> }>(async (request, { params }) => {
  const { platform } = Params.parse(await params);
  const url = new URL(request.url);
  const pending = readPendingOAuth(platform, request.headers.get("cookie"));

  const redirect = (query: Record<string, string>) => {
    const headers = new Headers({ Location: `/?${new URLSearchParams(query)}` });
    headers.append("Set-Cookie", clearPendingOAuthCookie(platform));
    return new Response(null, { status: 307, headers });
  };

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";
  if (!code || !pending || !safeEqual(state, pending.state)) {
    return redirect({
      connect_error: platform,
      reason: url.searchParams.get("error_description") ?? "invalid OAuth state",
    });
  }

  try {
    const provider = OAUTH_PROVIDERS[platform];
    const tokens = await provider.exchange(code, pending.verifier);
    const profile = await provider.profile(tokens.access_token);
    await saveConnection(db(), { sessionId: pending.sessionId, platform, tokens, profile });
    return redirect({ connected: platform, handle: profile.handle });
  } catch (err) {
    return redirect({
      connect_error: platform,
      reason: err instanceof Error ? err.message : "connection failed",
    });
  }
});
