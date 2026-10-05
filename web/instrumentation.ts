/**
 * Next.js server start hook: registers Langfuse tracing (no-op without
 * LANGFUSE_* keys) and the optional in-process job scheduler.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { NodeTracerProvider } = await import("@opentelemetry/sdk-trace-node");
  const { langfuseSpanProcessor } = await import("./lib/langfuseProcessor");
  new NodeTracerProvider({ spanProcessors: [langfuseSpanProcessor] }).register();

  const { env } = await import("./lib/config/env");
  if (env().KAMI_SCHEDULER) {
    const { startScheduler } = await import("./lib/jobs/scheduler");
    startScheduler();
  }
}
