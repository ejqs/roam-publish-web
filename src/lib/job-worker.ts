import { runJob } from "./jobs";
import { JOBS } from "./jobs-registry";

const TICK_MS = 5_000;
const started = globalThis as unknown as { jobWorker?: boolean };

/**
 * Runs the background jobs for as long as the server runs. Each tick offers every job a turn; a
 * job's own claim (lib/jobs.ts) decides whether it's due and keeps two processes off the same job.
 * A job never overlaps itself in one process.
 */
export function startJobWorker() {
  if (started.jobWorker || process.env.JOBS === "off") return;
  started.jobWorker = true;
  const running = new Set<string>();
  setInterval(() => {
    for (const job of JOBS) {
      if (running.has(job.name)) continue;
      running.add(job.name);
      runJob(job)
        .catch((e) => console.error(`job ${job.name} could not run`, e))
        .finally(() => running.delete(job.name));
    }
  }, TICK_MS).unref();
}
