import { dbConfigured, db } from "@/lib/db/client";
import { pollEmailReplies } from "@/lib/inbound/pollEmail";
import { pollMarketingReplies } from "@/lib/marketing/conversationReplies";
import { emailConfigured, emailProvider } from "@/lib/providers";

/**
 * Optional in-process scheduler for local installs (KAMI_SCHEDULER=on).
 * Production setups can instead call the /api/jobs/* routes from cron or
 * Hermes cron with `Authorization: Bearer $KAMI_CRON_SECRET`.
 */

interface Job {
  name: string;
  everyMs: number;
  enabled: () => boolean;
  run: () => Promise<unknown>;
}

const JOBS: Job[] = [
  {
    name: "email-replies",
    everyMs: 5 * 60_000,
    enabled: () => dbConfigured() && emailConfigured(),
    run: () => pollEmailReplies(db(), emailProvider()),
  },
  {
    name: "marketing-replies",
    everyMs: 10 * 60_000,
    enabled: dbConfigured,
    run: () => pollMarketingReplies(db()),
  },
];

let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;
  for (const job of JOBS) {
    let running = false;
    const tick = async () => {
      if (running || !job.enabled()) return;
      running = true;
      try {
        await job.run();
      } catch (err) {
        console.error(`[scheduler] ${job.name} failed:`, err instanceof Error ? err.message : err);
      } finally {
        running = false;
      }
    };
    setInterval(tick, job.everyMs).unref();
  }
  console.info(`[scheduler] running ${JOBS.map((j) => j.name).join(", ")}`);
}
