import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { resetEnvForTests } from "@/lib/config/env";
import { migrateOnStartup } from "./migrate";

/** Load web/.env.local into process.env. Does not override variables already set. */
function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(resolve(".env.local"));
resetEnvForTests();

const result = await migrateOnStartup();
if (result.skipped) {
  console.error("Set DATABASE_URL to the Postgres connection string, then run this again.");
  process.exit(1);
}
console.log(
  result.applied.length ? `Applied ${result.applied.join(", ")}` : "Schema is up to date.",
);
