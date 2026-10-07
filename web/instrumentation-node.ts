/**
 * Node.js-only start-up: Langfuse tracing (no-op without LANGFUSE_* keys) and
 * the optional in-process job scheduler (KAMI_SCHEDULER=on).
 */
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { env } from "./lib/config/env";
import { migrateOnStartup } from "./lib/db/migrate";
import { startScheduler } from "./lib/jobs/scheduler";
import { langfuseSpanProcessor } from "./lib/langfuseProcessor";

new NodeTracerProvider({ spanProcessors: [langfuseSpanProcessor] }).register();

await migrateOnStartup();

if (env().KAMI_SCHEDULER) startScheduler();
