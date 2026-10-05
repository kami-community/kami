import { createAgentMailProvider } from "@/lib/adapters/agentmail";
import { createDnsEmailVerifier } from "@/lib/adapters/dnsEmailVerifier";
import { createGoogleCalendarProvider } from "@/lib/adapters/googleCalendar";
import { createExaSearch, createLinkupSearch, createTavilySearch } from "@/lib/adapters/search";
import { createXAdsBoostProvider, readXAdsConfig } from "@/lib/adapters/xAds";
import type { PostBoostProvider } from "@/lib/ports/ads";
import type { CalendarProvider } from "@/lib/ports/calendar";
import { env } from "@/lib/config/env";
import { notConfigured } from "@/lib/http/errors";
import type { EmailProvider } from "@/lib/ports/email";
import type { EmailVerifier } from "@/lib/ports/emailVerifier";
import type { SearchProvider } from "@/lib/ports/search";

/**
 * Chooses the concrete adapter for each port from configuration. Services
 * receive ports from here and never import vendor modules directly.
 */

export function emailConfigured(): boolean {
  const c = env();
  return Boolean(c.AGENTMAIL_API_KEY && c.AGENTMAIL_INBOX);
}

export function emailProvider(): EmailProvider {
  const c = env();
  if (!c.AGENTMAIL_API_KEY || !c.AGENTMAIL_INBOX) {
    throw notConfigured("Email sending is not configured (AGENTMAIL_API_KEY, AGENTMAIL_INBOX)");
  }
  return createAgentMailProvider({
    apiKey: c.AGENTMAIL_API_KEY,
    inbox: c.AGENTMAIL_INBOX,
    webhookSecret: c.AGENTMAIL_WEBHOOK_SECRET,
  });
}

/** Configured search providers, in preference order (first is used). */
export function searchProviders(): SearchProvider[] {
  const c = env();
  const providers: SearchProvider[] = [];
  if (c.LINKUP_API_KEY) providers.push(createLinkupSearch(c.LINKUP_API_KEY));
  if (c.EXA_API_KEY) providers.push(createExaSearch(c.EXA_API_KEY));
  if (c.TAVILY_API_KEY) providers.push(createTavilySearch(c.TAVILY_API_KEY));
  return providers;
}

/** The search provider to use, or null when none is configured (research falls back to first-party only). */
export function searchProvider(): SearchProvider | null {
  return searchProviders()[0] ?? null;
}

/** X Ads boosts, or null unless every X_ADS_* credential is set. */
export function boostProvider(): PostBoostProvider | null {
  const config = readXAdsConfig(env());
  return config ? createXAdsBoostProvider(config) : null;
}

/** Google Calendar, or null when its OAuth credentials are not set. */
export function calendarProvider(): CalendarProvider | null {
  const c = env();
  if (!c.GOOGLE_CLIENT_ID || !c.GOOGLE_CLIENT_SECRET || !c.GOOGLE_REFRESH_TOKEN) return null;
  return createGoogleCalendarProvider({
    clientId: c.GOOGLE_CLIENT_ID,
    clientSecret: c.GOOGLE_CLIENT_SECRET,
    refreshToken: c.GOOGLE_REFRESH_TOKEN,
  });
}

const verifier = createDnsEmailVerifier();

/** Deliverability checks (DNS: MX, then A/AAAA). */
export function emailVerifier(): EmailVerifier {
  return verifier;
}
