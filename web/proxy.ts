import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, decideAccess, isCrossSiteMutation } from "@/lib/auth/access";
import { env } from "@/lib/config/env";

/** Paths reachable without the admin session (they verify requests themselves). */
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/webhooks/"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const host = request.headers.get("host");

  if (
    isApi &&
    isCrossSiteMutation({
      method: request.method,
      host,
      origin: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    })
  ) {
    return NextResponse.json(
      { error: "cross-site request blocked", code: "forbidden" },
      { status: 403 },
    );
  }

  if (PUBLIC_PATHS.some((p) => pathname === p || (p.endsWith("/") && pathname.startsWith(p)))) {
    return NextResponse.next();
  }

  const config = env();
  const decision = decideAccess({
    host,
    authorization: request.headers.get("authorization"),
    adminCookie: request.cookies.get(ADMIN_COOKIE)?.value ?? null,
    adminToken: config.KAMI_ADMIN_TOKEN,
    cronSecret: config.KAMI_CRON_SECRET,
  });
  if (decision.allowed) return NextResponse.next();

  if (isApi) {
    return NextResponse.json({ error: decision.reason, code: "unauthorized" }, { status: 401 });
  }
  if (!config.KAMI_ADMIN_TOKEN) {
    return new NextResponse(decision.reason, { status: 403 });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|jpg|webp)$).*)"],
};
