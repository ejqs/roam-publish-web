import { and, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { backgroundJob, type JobResult } from "@/db/schema";

/**
 * Background jobs: each runs on an interval inside the server process (lib/job-worker.ts) and
 * records how it went in `background_job`, which /admin/jobs shows.
 */
export type JobDef = {
  name: string;
  label: string;
  description: string;
  /** Plain-words schedule for the admin page. */
  schedule: string;
  intervalMs: number;
  /**
   * Exclusive jobs claim their row first, so only one process runs them at a time and "Run now"
   * works. A non-exclusive job guards itself (the change log claims entries) and runs every tick.
   */
  exclusive: boolean;
  /** Why the job is off here, or null. */
  disabledReason: () => string | null;
  /**
   * Does the work. Returns what it did, or null when there was nothing to do: a non-exclusive job
   * then writes only a heartbeat now and then instead of a row update every tick.
   */
  run: (ctx: { cursor: Record<string, unknown> }) => Promise<JobResult | null>;
};

/** How long a claim lasts. Longer than any run; a claim that runs out means the process died. */
export const LEASE_MS = 15 * 60_000;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;
const HEARTBEAT_MS = 60_000;
const ERROR_MAX = 2000;

const ensured = new Set<string>();
const heartbeats = new Map<string, number>();

async function ensureRow(job: JobDef) {
  if (ensured.has(job.name)) return;
  await db
    .insert(backgroundJob)
    // Due from the start: a job that has never run runs on the first tick.
    .values({ name: job.name, intervalMs: job.intervalMs, nextDueAt: new Date(0) })
    .onConflictDoUpdate({ target: backgroundJob.name, set: { intervalMs: job.intervalMs } });
  ensured.add(job.name);
}

/** Tests empty the tables between cases; this makes the next run create its row again. */
export const forgetJobRows = () => ensured.clear();

/** Wait after the nth failure in a row: the interval doubled each time, at most six hours. */
export const backoffMs = (intervalMs: number, failures: number) =>
  Math.min(intervalMs * 2 ** Math.min(failures, 20), Math.max(MAX_BACKOFF_MS, intervalMs));

/** Runs the job if it's due and no other process has it. Returns whether it ran. */
export async function runJob(job: JobDef, now = new Date()): Promise<boolean> {
  if (job.disabledReason()) return false;
  await ensureRow(job);

  let cursor: Record<string, unknown>;
  let failures: number;
  if (job.exclusive) {
    const [claimed] = await db
      .update(backgroundJob)
      .set({ lockedUntil: new Date(now.getTime() + LEASE_MS), lastStartedAt: now })
      .where(
        and(
          eq(backgroundJob.name, job.name),
          lte(backgroundJob.nextDueAt, now),
          or(isNull(backgroundJob.lockedUntil), lt(backgroundJob.lockedUntil, now)),
        ),
      )
      .returning({ cursor: backgroundJob.cursor, failures: backgroundJob.consecutiveFailures });
    if (!claimed) return false;
    ({ cursor, failures } = claimed);
  } else {
    const row = await db.query.backgroundJob.findFirst({ where: eq(backgroundJob.name, job.name) });
    cursor = row?.cursor ?? {};
    failures = row?.consecutiveFailures ?? 0;
  }

  const started = Date.now();
  const startedAt = new Date();
  cursor = structuredClone(cursor);
  try {
    const result = await job.run({ cursor });
    const finishedAt = new Date();
    if (result === null && !job.exclusive && failures === 0) {
      // Nothing happened: just say we're alive, at most once a minute.
      if (Date.now() - (heartbeats.get(job.name) ?? 0) < HEARTBEAT_MS) return true;
      heartbeats.set(job.name, Date.now());
      await db.update(backgroundJob).set({ lastFinishedAt: finishedAt, cursor }).where(eq(backgroundJob.name, job.name));
      return true;
    }
    heartbeats.set(job.name, Date.now());
    await db
      .update(backgroundJob)
      .set({
        lastStartedAt: startedAt,
        lastFinishedAt: finishedAt,
        lastSuccessAt: finishedAt,
        lastDurationMs: Date.now() - started,
        ...(result ? { lastResult: result } : {}),
        cursor,
        consecutiveFailures: 0,
        runCount: sql`${backgroundJob.runCount} + 1`,
        nextDueAt: new Date(finishedAt.getTime() + job.intervalMs),
        lockedUntil: null,
      })
      .where(eq(backgroundJob.name, job.name));
  } catch (e) {
    const finishedAt = new Date();
    const message = (e instanceof Error ? e.message : String(e)).slice(0, ERROR_MAX);
    console.error(`job ${job.name} failed`, e);
    await db
      .update(backgroundJob)
      .set({
        lastStartedAt: startedAt,
        lastFinishedAt: finishedAt,
        lastDurationMs: Date.now() - started,
        lastError: message,
        lastErrorAt: finishedAt,
        // The cursor keeps anything the run saved before failing, like an API call count.
        cursor,
        consecutiveFailures: sql`${backgroundJob.consecutiveFailures} + 1`,
        runCount: sql`${backgroundJob.runCount} + 1`,
        failCount: sql`${backgroundJob.failCount} + 1`,
        nextDueAt: new Date(finishedAt.getTime() + backoffMs(job.intervalMs, failures + 1)),
        lockedUntil: null,
      })
      .where(eq(backgroundJob.name, job.name));
  }
  return true;
}

/** Makes an exclusive job due now; the worker picks it up on its next tick. */
export async function requestRun(name: string) {
  await db.update(backgroundJob).set({ nextDueAt: new Date() }).where(eq(backgroundJob.name, name));
}

export type JobRow = typeof backgroundJob.$inferSelect;

export type JobStatus =
  | { kind: "disabled"; reason: string }
  | { kind: "never" }
  | { kind: "running" }
  | { kind: "stalled" }
  | { kind: "failing"; failures: number }
  | { kind: "overdue" }
  | { kind: "ok" };

/** One line of health for the admin page. */
export function jobStatus(job: JobDef, row: JobRow | undefined, now = new Date()): JobStatus {
  const reason = job.disabledReason();
  if (reason) return { kind: "disabled", reason };
  if (!row || (!row.lastFinishedAt && !row.lockedUntil)) return { kind: "never" };
  if (row.lockedUntil) return row.lockedUntil > now ? { kind: "running" } : { kind: "stalled" };
  if (row.consecutiveFailures > 0) return { kind: "failing", failures: row.consecutiveFailures };
  // Non-exclusive jobs heartbeat at least once a minute while the worker runs.
  const late = job.exclusive
    ? now.getTime() - row.nextDueAt.getTime() > 2 * job.intervalMs + 60_000
    : !row.lastFinishedAt || now.getTime() - row.lastFinishedAt.getTime() > 5 * HEARTBEAT_MS;
  return late ? { kind: "overdue" } : { kind: "ok" };
}

/** UTC day, for per-day counters kept in a job's cursor. */
export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

/** Adds API calls to the cursor's count for today, starting over each UTC day. */
export function countCalls(cursor: Record<string, unknown>, calls: number, now = new Date()) {
  const day = utcDay(now);
  const prev = cursor.callsDay === day && typeof cursor.callsToday === "number" ? cursor.callsToday : 0;
  cursor.callsDay = day;
  cursor.callsToday = prev + calls;
}
