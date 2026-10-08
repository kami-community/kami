import { detectCapabilities } from "@/lib/capabilities";
import { route } from "@/lib/http/route";

/** What this install can do (no secrets). */
export const GET = route(async () => Response.json(await detectCapabilities()));
