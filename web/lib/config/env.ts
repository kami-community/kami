import { z } from "zod";

/**
 * The single source of server configuration. Every module reads settings
 * through `env()` instead of `process.env`, so defaults live in one place
 * and tests can swap values with `resetEnvForTests()`.
 */

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const flag = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) =>
      v === undefined || v === "" ? fallback : ["1", "true", "on", "yes"].includes(v.toLowerCase()),
    );

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  // Access control (single-user Community Edition)
  KAMI_ADMIN_TOKEN: optional,
  KAMI_CRON_SECRET: optional,
  KAMI_TOKEN_ENCRYPTION_KEY: optional,
  KAMI_SCHEDULER: flag(false),

  // Hermes agent runtime
  HERMES_GATEWAY_URL: z.string().url().default("http://127.0.0.1:8642/v1/chat/completions"),
  HERMES_API_KEY: optional,
  HERMES_MODEL: z.string().default("hermes-agent"),
  HERMES_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  HERMES_HOME: optional,
  HERMES_BROWSER_CDP_URL: optional,

  // Persistence
  NEXT_PUBLIC_SUPABASE_URL: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,

  // Research providers
  LINKUP_API_KEY: optional,
  EXA_API_KEY: optional,
  TAVILY_API_KEY: optional,
  APIFY_API_TOKEN: optional,
  APIFY_IG_HASHTAG_ACTOR: z.string().default("apify~instagram-hashtag-scraper"),

  // Email
  EMAIL_PROVIDER: z.enum(["agentmail"]).default("agentmail"),
  AGENTMAIL_API_KEY: optional,
  AGENTMAIL_INBOX: optional,
  AGENTMAIL_WEBHOOK_SECRET: optional,

  // X
  X_CLIENT_ID: optional,
  X_CLIENT_SECRET: optional,
  X_REDIRECT_URI: optional,
  X_ADS_ACCESS_TOKEN: optional,
  X_ADS_ACCOUNT_ID: optional,

  // Instagram
  INSTAGRAM_APP_ID: optional,
  INSTAGRAM_APP_SECRET: optional,
  INSTAGRAM_REDIRECT_URI: optional,
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN: optional,

  // Google Calendar
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  GOOGLE_REFRESH_TOKEN: optional,

  // Observability
  LANGFUSE_PUBLIC_KEY: optional,
  LANGFUSE_SECRET_KEY: optional,
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      throw new Error(`Invalid environment configuration:\n  ${issues.join("\n  ")}`);
    }
    cached = parsed.data;
  }
  return cached;
}

/** Test hook: forget the cached config so the next `env()` re-reads process.env. */
export function resetEnvForTests(): void {
  cached = null;
}
