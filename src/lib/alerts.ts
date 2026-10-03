import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { announcement, backgroundJob, type JobResult, user } from "@/db/schema";
import { sendEmail } from "./email";
import { type JobDef, jobStatus } from "./jobs";
import {
  ERROR_RATE_FLAG,
  type MetricStats,
  metricStats,
  REJECTED_MIN_CALLS,
  REJECTED_RATE_FLAG,
  SLOW_P95_MS,
} from "./telemetry-stats";

/**
 * Emails the admins when something on /admin/status goes wrong: one digest when problems start, a
 * reminder while they last, and an all-clear when they're over. Run by the status-alerts job, so it
 * needs the database: an outage is for an uptime monitor on /api/health to catch.
 */

/** How far back each check looks. */
export const ALERT_WINDOW_MS = 15 * 60_000;
/** A problem still open gets a reminder this often. */
export const REMIND_MS = 6 * 60 * 60_000;
/** Too few calls to call it a problem: one person's bad luck, not an outage. */
const MIN_ERRORS = 3;
/**
 * Right after a start or deploy, the other jobs' heartbeats are from before it and read as overdue,
 * so jobs aren't checked until the worker has been up this long.
 */
export const JOB_WARMUP_MS = 3 * 60_000;
const processStarted = Date.now();
/** Whether this process has been up long enough for job heartbeats to mean something. */
export const jobsWarmedUp = () => Date.now() - processStarted >= JOB_WARMUP_MS;
const MIN_SLOW_CALLS = 10;

export type Problem = { key: string; text: string };
type Open = Record<string, { since: string; text: string }>;

const ms = (v: number) => (v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(1)} s`);
const pct = (r: number) => `${(r * 100).toFixed(0)}%`;

/** What's wrong in these stats and job rows. Keys stay the same while the same thing is wrong. */
export function findProblems(stats: MetricStats[], jobs: { def: JobDef; row: typeof backgroundJob.$inferSelect | undefined }[], now: Date) {
  const out: Problem[] = [];
  for (const s of stats) {
    if (s.kind === "page") {
      if (s.count >= MIN_ERRORS) out.push({ key: `errors:${s.name}`, text: `${s.name}: ${s.count} render errors. Last: ${s.lastError}` });
      continue;
    }
    if (s.errors >= MIN_ERRORS && s.errorRate > ERROR_RATE_FLAG)
      out.push({
        key: `errors:${s.name}`,
        text: `${s.name}: ${s.errors} of ${s.count} calls failed (${pct(s.errorRate)}). Last: ${s.lastError}`,
      });
    if (s.count >= MIN_SLOW_CALLS && (s.p95 ?? 0) > SLOW_P95_MS[s.kind])
      out.push({ key: `slow:${s.name}`, text: `${s.name}: slow, p95 ${ms(s.p95 ?? 0)} over ${s.count} calls` });
    if (s.count >= REJECTED_MIN_CALLS && s.rejectedRate > REJECTED_RATE_FLAG)
      out.push({
        key: `rejected:${s.name}`,
        text: `${s.name}: ${pct(s.rejectedRate)} of ${s.count} calls refused (${s.rejected.map((r) => `${r.status} ×${r.n}`).join(", ")})`,
      });
  }
  for (const { def, row } of jobs) {
    const st = jobStatus(def, row, now);
    if (st.kind === "failing" || st.kind === "overdue" || st.kind === "stalled")
      out.push({
        key: `job:${def.name}`,
        text: `Job "${def.label}": ${st.kind === "failing" ? `failing (${st.failures} in a row). Last: ${row?.lastError}` : st.kind}`,
      });
  }
  return out;
}

/** Who gets alerts: every user with better-auth's "admin" role. */
export async function alertRecipients() {
  const admins = await db.select({ email: user.email }).from(user).where(eq(user.role, "admin"));
  return admins.map((a) => a.email);
}

/**
 * Compares what's wrong now with what was open last run (kept in the job's cursor) and emails a
 * digest when something started, ended, or is due a reminder. Throws if the email didn't go, so the
 * job retries and shows as failing on /admin/jobs.
 */
export async function runAlerts(
  cursor: Record<string, unknown>,
  jobs: JobDef[],
  now = new Date(),
  { checkJobs = jobsWarmedUp() }: { checkJobs?: boolean } = {},
): Promise<JobResult | null> {
  const [stats, rows] = await Promise.all([
    metricStats(new Date(now.getTime() - ALERT_WINDOW_MS), now),
    db.select().from(backgroundJob),
  ]);
  const byName = new Map(rows.map((r) => [r.name, r]));
  const open: Open = (cursor.open as Open | undefined) ?? {};
  const problems = findProblems(
    stats,
    checkJobs ? jobs.map((def) => ({ def, row: byName.get(def.name) })) : [],
    now,
  );
  // Not checked yet: job problems stay as they were, neither new nor fixed.
  if (!checkJobs)
    for (const [key, o] of Object.entries(open)) if (key.startsWith("job:")) problems.push({ key, text: o.text });

  const lastSent = typeof cursor.lastSentAt === "string" ? new Date(cursor.lastSentAt) : null;
  const current = new Map(problems.map((p) => [p.key, p]));
  const started = problems.filter((p) => !open[p.key]);
  const ended = Object.entries(open)
    .filter(([key]) => !current.has(key))
    .map(([, o]) => o.text);
  const remind = !!problems.length && !started.length && (!lastSent || now.getTime() - lastSent.getTime() >= REMIND_MS);

  const next: Open = {};
  for (const p of problems) next[p.key] = { since: open[p.key]?.since ?? now.toISOString(), text: p.text };
  if (!started.length && !ended.length && !remind) {
    cursor.open = next;
    return null;
  }

  const to = await alertRecipients();
  if (!to.length) {
    cursor.open = next;
    return { problems: problems.length, sent: 0, reason: "no admins" };
  }

  const ongoing = problems.filter((p) => open[p.key]);
  // What users are being told about it (lib/status-banner.ts), so the admin knows without looking.
  const banners = await db
    .select({ tone: announcement.tone, message: announcement.message, mutedUntil: announcement.mutedUntil })
    .from(announcement)
    .where(and(eq(announcement.source, "auto"), gt(announcement.endsAt, now)));
  const subject = problems.length
    ? `[Roam Publish] ${problems.length} problem${problems.length === 1 ? "" : "s"}: ${problems[0].text.split(":")[0]}${problems.length > 1 ? " and more" : ""}`
    : "[Roam Publish] All clear";
  const section = (title: string, lines: string[]) => (lines.length ? `${title}\n${lines.map((l) => `- ${l}`).join("\n")}\n\n` : "");
  const text =
    section("New problems:", started.map((p) => p.text)) +
    section("Still going:", ongoing.map((p) => `${p.text} (since ${next[p.key].since})`)) +
    section("Fixed:", ended) +
    section(
      "Banner on the site:",
      banners.map((b) => `${b.tone}: ${b.message}${b.mutedUntil && b.mutedUntil > now ? " (muted)" : ""}`),
    ) +
    `Details: ${process.env.NEXT_PUBLIC_APP_URL ?? ""}/admin/status\n` +
    `Checked the last ${ALERT_WINDOW_MS / 60_000} minutes. Reminders every ${REMIND_MS / 3_600_000} hours while a problem lasts.`;

  // The cursor is saved even when a run fails, so only move on once the email went: a failed send
  // finds the same problems new next time and tries again.
  const failed: string[] = [];
  for (const address of to) if (!(await sendEmail({ to: address, subject, text }))) failed.push(address);
  if (failed.length === to.length) throw new Error(`Couldn't send the alert email to ${failed.join(", ")}`);
  cursor.open = next;
  cursor.lastSentAt = now.toISOString();
  return { problems: problems.length, started: started.length, fixed: ended.length, sent: to.length };
}
