#!/usr/bin/env node
/**
 * Community Edition readiness check — prints unlocked capabilities without secrets.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webEnvPath = join(root, "web", ".env.local");

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

const env = { ...process.env, ...loadEnvFile(webEnvPath) };
const has = (k) => typeof env[k] === "string" && env[k].trim().length > 0;

const checks = [
  ["web/.env.local", existsSync(webEnvPath)],
  ["HERMES_GATEWAY_URL", has("HERMES_GATEWAY_URL")],
  ["HERMES_API_KEY", has("HERMES_API_KEY")],
  ["Supabase URL", has("NEXT_PUBLIC_SUPABASE_URL")],
  ["Supabase service role", has("SUPABASE_SERVICE_ROLE_KEY")],
  ["Browser CDP (optional)", has("HERMES_BROWSER_CDP_URL")],
  ["Research provider (optional)", has("LINKUP_API_KEY") || has("EXA_API_KEY") || has("TAVILY_API_KEY")],
  ["AgentMail (optional send)", has("AGENTMAIL_API_KEY")],
  ["X OAuth (optional publish)", has("X_CLIENT_ID") && has("X_CLIENT_SECRET")],
];

console.log("Kami Community Edition — readiness\n");
for (const [label, ok] of checks) {
  console.log(`${ok ? "OK " : "-- "} ${label}`);
}

// Live gateway probe (never prints key)
const gateway = env.HERMES_GATEWAY_URL || "http://127.0.0.1:8642/v1/chat/completions";
const healthBase = gateway.replace(/\/v1\/chat\/completions\/?$/, "");
let gatewayReachable = false;
try {
  const res = await fetch(`${healthBase}/health`, { signal: AbortSignal.timeout(3000) });
  gatewayReachable = res.ok;
  console.log(res.ok ? "\nHermes /health: reachable" : `\nHermes /health: HTTP ${res.status}`);
} catch {
  console.log("\nHermes /health: not reachable (start local gateway on :8642)");
}

const unlocked = [];
if (has("HERMES_API_KEY") && gatewayReachable) unlocked.push("Hermes agent runs");
else if (has("HERMES_API_KEY")) unlocked.push("Hermes configured (gateway not reachable)");
if (has("NEXT_PUBLIC_SUPABASE_URL") && has("SUPABASE_SERVICE_ROLE_KEY")) unlocked.push("Persistence");
if (has("HERMES_BROWSER_CDP_URL")) unlocked.push("Browser research");
if (has("LINKUP_API_KEY") || has("EXA_API_KEY") || has("TAVILY_API_KEY")) unlocked.push("Provider research");
unlocked.push("Manual URL / domain research (always)");
if (has("AGENTMAIL_API_KEY")) unlocked.push("Sales send");
else unlocked.push("Sales drafts only (no AgentMail)");
if (has("X_CLIENT_ID") && has("X_CLIENT_SECRET")) unlocked.push("X publish path");
else unlocked.push("X drafts / manual post only");

console.log("\nUnlocked:");
for (const u of unlocked) console.log(`  · ${u}`);

const requiredOk =
  has("HERMES_API_KEY") &&
  has("NEXT_PUBLIC_SUPABASE_URL") &&
  has("SUPABASE_SERVICE_ROLE_KEY");

if (!requiredOk) {
  console.log("\nMissing required keys — see web/.env.example and SETUP.md");
  process.exitCode = 1;
} else {
  console.log("\nRequired local config present. Apply SQL migrations, start Hermes, then npm run dev.");
}
