import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/config/env";
import { notConfigured } from "@/lib/http/errors";

/**
 * Server-side Supabase client (service role — bypasses RLS; never expose to the browser).
 * Row-level security is enabled with no policies, so the anon key reads nothing.
 */

let client: SupabaseClient | null = null;

export function dbConfigured(): boolean {
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();
  return Boolean(NEXT_PUBLIC_SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

/** The database client, or a 503 `not_configured` error when Supabase is not set up. */
export function db(): SupabaseClient {
  if (client) return client;
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = env();
  if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw notConfigured(
      "Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)",
    );
  }
  client = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  return client;
}

/** For best-effort writes (logging) that must never fail the caller. */
export function dbOrNull(): SupabaseClient | null {
  return dbConfigured() ? db() : null;
}

export type Db = SupabaseClient;
