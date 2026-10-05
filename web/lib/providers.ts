import { createAgentMailProvider } from "@/lib/adapters/agentmail";
import { createExaSearch, createLinkupSearch, createTavilySearch } from "@/lib/adapters/search";
import { env } from "@/lib/config/env";
import { notConfigured } from "@/lib/http/errors";
import type { EmailProvider } from "@/lib/ports/email";
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
