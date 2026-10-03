import { sql } from "drizzle-orm";
import { db } from "@/db";
import { type AnnouncementAudience, type AnnouncementTone, announcement, backgroundJob, type JobResult } from "@/db/schema";
import { forgetAnnouncements } from "./announcements";
import { type JobDef, jobStatus } from "./jobs";
import {
  ERROR_RATE_FLAG,
  type MetricStats,
  metricStats,
  SLOW_P95_MS,
} from "./telemetry-stats";

/**
 * Puts up the site-wide banner on its own when /admin/status shows something people would notice,
 * and takes it down when that's over. Run every minute by the status-banner job. The admin email
 * (lib/alerts.ts) covers everything; this only covers what users feel, in their words.
 */

/** How far back each run looks. */
export const BANNER_WINDOW_MS = 10 * 60_000;
/** Each run that still sees the problem keeps the banner up this much longer: a few missed runs. */
export const BANNER_HOLD_MS = 3 * 60_000;
/** Runs in a row that must see a problem before the banner goes up, so one bad minute doesn't. */
export const RUNS_TO_SHOW = 2;

/** Same floor as the admin email: fewer is one person's bad luck. */
const MIN_ERRORS = 3;
const MIN_SLOW_CALLS = 10;
/** Most calls failing: it isn't working, not just flaky. */
const CRITICAL_ERRORS = 5;
const CRITICAL_RATE = 0.25;
/** Page render errors (pages only record errors, not calls). */
const PAGE_WARN = 3;
const PAGE_CRITICAL = 20;

type Impact = {
  key: string;
  /** Plain words for /admin/announcement. */
  label: string;
  audience: AnnouncementAudience;
  warning: string;
  /** Absent: this never gets worse than a warning. */
  critical?: string;
  /** Which /admin/status rows count. */
  metrics: (name: string) => boolean;
  /**
   * Slow counts as a warning too (our own routes, not outside services). Refused calls never count:
   * one person with a revoked key can make most calls in a quiet window refused. The admin email
   * still flags them.
   */
  slow?: boolean;
  /** Background jobs whose failing, stalling or running late counts as a warning. */
  jobs?: string[];
};

const named = (...names: string[]) => (n: string) => names.includes(n);

/** What people would notice, from worst to least. Anything else on /admin/status isn't urgent for them. */
export const IMPACTS: Impact[] = [
  {
    key: "reading",
    label: "Published pages failing to load",
    audience: "everyone",
    warning: "Some published pages aren't loading right now. We're looking into it.",
    critical: "Published pages aren't loading right now. We're working on it.",
    metrics: (n) => /^page \/(\[graph\]|p\/|c\/|collection\/)/.test(n),
  },
  {
    key: "sign-in",
    label: "Signing in",
    audience: "everyone",
    warning: "Signing in is failing for some people right now. We're looking into it.",
    critical: "Signing in isn't working right now. We're working on it.",
    metrics: named("GET /api/auth/[...all]", "POST /api/auth/[...all]"),
  },
  {
    key: "publishing",
    label: "Publishing from Roam",
    audience: "signed-in",
    warning: "Publishing from Roam is slow or failing for some people. Published pages are still online.",
    critical: "Publishing from Roam isn't working right now. Published pages are still online.",
    metrics: named(
      "POST /api/ext/publications",
      "GET /api/ext/publications",
      "PATCH /api/ext/publications/[rootUid]",
      "DELETE /api/ext/publications/[rootUid]",
      "POST /api/ext/claim",
      "POST /api/ext/shortlinks",
    ),
    slow: true,
  },
  {
    key: "dashboard",
    label: "Dashboard changes",
    audience: "signed-in",
    warning: "Some dashboard changes may not save right now. Try again in a few minutes.",
    metrics: (n) => n.startsWith("dashboard.") || n.startsWith("onboarding."),
  },
  {
    key: "roam-changelog",
    label: "Change log entries to Roam",
    audience: "signed-in",
    warning: "Change log entries to Roam are delayed. They'll be sent when this clears.",
    // Roam refusing a token is the graph owner's to fix, and shows on their dashboard: only errors count.
    metrics: named("dep roam-append"),
    jobs: ["changelog-send"],
  },
  {
    key: "email",
    label: "Emails",
    audience: "everyone",
    warning: "Sign-up and password-reset emails may be delayed.",
    metrics: named("dep resend"),
  },
];

export type Found = { key: string; tone: AnnouncementTone; audience: AnnouncementAudience; message: string };

const failing = (s: MetricStats) => s.errors >= MIN_ERRORS && s.errorRate > ERROR_RATE_FLAG;
const down = (s: MetricStats) => s.errors >= CRITICAL_ERRORS && s.errorRate >= CRITICAL_RATE;
const slow = (s: MetricStats) => s.count >= MIN_SLOW_CALLS && (s.p95 ?? 0) > SLOW_P95_MS[s.kind];

function toneOf(impact: Impact, s: MetricStats): AnnouncementTone | null {
  if (s.kind === "page") return s.count >= PAGE_CRITICAL ? "critical" : s.count >= PAGE_WARN ? "warning" : null;
  if (down(s)) return "critical";
  if (failing(s) || (impact.slow && slow(s))) return "warning";
  return null;
}

/** What people would notice in these stats and job rows, worst tone per impact. */
export function impactsFrom(
  stats: MetricStats[],
  jobs: { def: JobDef; row: typeof backgroundJob.$inferSelect | undefined }[],
  now: Date,
): Found[] {
  const out: Found[] = [];
  for (const impact of IMPACTS) {
    let tone: AnnouncementTone | null = null;
    for (const s of stats) {
      if (!impact.metrics(s.name)) continue;
      const t = toneOf(impact, s);
      if (t === "critical" || (t && !tone)) tone = t;
    }
    for (const { def, row } of jobs) {
      if (tone || !impact.jobs?.includes(def.name)) continue;
      const st = jobStatus(def, row, now).kind;
      if (st === "failing" || st === "stalled" || st === "overdue") tone = "warning";
    }
    if (!tone) continue;
    if (tone === "critical" && !impact.critical) tone = "warning";
    out.push({
      key: impact.key,
      tone,
      audience: impact.audience,
      message: tone === "critical" ? impact.critical! : impact.warning,
    });
  }
  return out;
}

/**
 * One status-banner run: counts how many runs in a row saw each impact (kept in the job's cursor)
 * and, from the second, puts up or keeps up its banner. A banner whose problem is gone isn't touched:
 * its `endsAt` passes and it's gone, which also happens if this job stops running.
 */
export async function runStatusBanner(
  cursor: Record<string, unknown>,
  jobs: JobDef[],
  now = new Date(),
  { checkJobs = true }: { checkJobs?: boolean } = {},
): Promise<JobResult | null> {
  const [stats, rows] = await Promise.all([
    metricStats(new Date(now.getTime() - BANNER_WINDOW_MS), now),
    checkJobs ? db.select().from(backgroundJob) : Promise.resolve([]),
  ]);
  const byName = new Map(rows.map((r) => [r.name, r]));
  const found = impactsFrom(
    stats,
    checkJobs ? jobs.map((def) => ({ def, row: byName.get(def.name) })) : [],
    now,
  );

  const seen = (cursor.seen as Record<string, number> | undefined) ?? {};
  const nextSeen: Record<string, number> = {};
  for (const f of found) nextSeen[f.key] = Math.min((seen[f.key] ?? 0) + 1, RUNS_TO_SHOW);
  cursor.seen = nextSeen;

  const show = found.filter((f) => nextSeen[f.key] >= RUNS_TO_SHOW);
  if (!show.length) return null;

  const endsAt = new Date(now.getTime() + BANNER_HOLD_MS);
  const a = sql.raw(`"announcement"`);
  for (const f of show)
    await db
      .insert(announcement)
      .values({ source: "auto", key: f.key, tone: f.tone, audience: f.audience, message: f.message, startsAt: now, endsAt, updatedAt: now })
      .onConflictDoUpdate({
        target: announcement.key,
        set: {
          tone: f.tone,
          audience: f.audience,
          message: f.message,
          endsAt,
          updatedAt: now,
          // A banner that had ended is a new incident: a new start, so a dismissal doesn't carry over.
          startsAt: sql`case when ${a}.ends_at <= ${now.toISOString()}::timestamptz then ${now.toISOString()}::timestamptz else ${a}.starts_at end`,
        },
      });
  forgetAnnouncements();
  return { shown: show.length, keys: show.map((f) => `${f.key}:${f.tone}`).join(", ") };
}
