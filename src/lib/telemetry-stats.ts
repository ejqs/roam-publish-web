import { and, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { endpointMetric } from "@/db/schema";
import { type Bucket, drainBuckets, LATENCY_BINS, type MetricKind, restoreBuckets } from "./telemetry";

/** How long per-minute rows are kept. */
export const METRIC_RETENTION_MS = 14 * 24 * 60 * 60_000;

/**
 * Writes the finished minutes from memory to `endpoint_metric`, adding to a row that's already
 * there (another process, or a retry), and drops rows past retention. Returns what it did, or null.
 */
export async function flushMetrics(now = new Date(), all = false) {
  const drained = drainBuckets(now, all);
  if (drained.length) {
    try {
      await writeBuckets(drained);
    } catch (e) {
      restoreBuckets(drained);
      throw e;
    }
  }
  const pruned = await db
    .delete(endpointMetric)
    .where(lt(endpointMetric.minute, new Date(now.getTime() - METRIC_RETENTION_MS)))
    .returning({ name: endpointMetric.name });
  if (!drained.length && !pruned.length) return null;
  return { rows: drained.length, calls: drained.reduce((n, b) => n + b.count, 0), pruned: pruned.length };
}

async function writeBuckets(rows: Bucket[]) {
  const e = sql.raw(`"endpoint_metric"`);
  await db
    .insert(endpointMetric)
    .values(rows)
    .onConflictDoUpdate({
      target: [endpointMetric.name, endpointMetric.minute],
      set: {
        count: sql`${e}.count + excluded.count`,
        errors: sql`${e}.errors + excluded.errors`,
        sumMs: sql`${e}.sum_ms + excluded.sum_ms`,
        maxMs: sql`greatest(${e}.max_ms, excluded.max_ms)`,
        hist: sql`(select array_agg(coalesce(a, 0) + coalesce(b, 0) order by i)
          from unnest(${e}.hist, excluded.hist) with ordinality as t(a, b, i))`,
        rejected: sql`(select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
          select k, sum(v::int) as n from (
            select * from jsonb_each_text(${e}.rejected) union all select * from jsonb_each_text(excluded.rejected)
          ) as t(k, v) group by k) as s)`,
        lastError: sql`case when excluded.last_error_at > ${e}.last_error_at or ${e}.last_error_at is null
          then excluded.last_error else ${e}.last_error end`,
        lastErrorAt: sql`greatest(${e}.last_error_at, excluded.last_error_at)`,
      },
    });
}

/** The latency under which `p` (0–1) of calls finished: the top of that bin, at most the slowest call. */
export function percentile(hist: number[], p: number, maxMs: number) {
  const total = hist.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const want = Math.ceil(total * p);
  let seen = 0;
  for (let i = 0; i < hist.length; i++) {
    seen += hist[i];
    if (seen >= want) return Math.min(LATENCY_BINS[i], maxMs);
  }
  return maxMs;
}

export type MetricStats = {
  name: string;
  kind: MetricKind;
  count: number;
  errors: number;
  errorRate: number;
  avgMs: number;
  p50: number | null;
  p95: number | null;
  maxMs: number;
  /** 4xx answers by status, most first. */
  rejected: { status: number; n: number }[];
  rejectedRate: number;
  lastError: string | null;
  lastErrorAt: Date | null;
};

/** Per-name totals for minutes from `since` on, slowest-to-fix first: error rate, then p95. */
export async function metricStats(since: Date, until = new Date()): Promise<MetricStats[]> {
  const window = and(gte(endpointMetric.minute, since), lt(endpointMetric.minute, until));
  const [totals, bins, refused] = await Promise.all([
    db
      .select({
        name: endpointMetric.name,
        kind: endpointMetric.kind,
        count: sql<number>`sum(${endpointMetric.count})::int`,
        errors: sql<number>`sum(${endpointMetric.errors})::int`,
        sumMs: sql<number>`sum(${endpointMetric.sumMs})::float8`,
        maxMs: sql<number>`max(${endpointMetric.maxMs})::int`,
        lastError: sql<string | null>`(array_agg(${endpointMetric.lastError} order by ${endpointMetric.lastErrorAt} desc nulls last))[1]`,
        lastErrorAt: sql<string | null>`max(${endpointMetric.lastErrorAt})`,
      })
      .from(endpointMetric)
      .where(window)
      .groupBy(endpointMetric.name, endpointMetric.kind),
    db.execute<{ name: string; i: number; n: number }>(sql`
      select ${endpointMetric.name} as name, u.i::int as i, sum(u.h)::int as n
      from ${endpointMetric}, unnest(${endpointMetric.hist}) with ordinality as u(h, i)
      where ${window}
      group by 1, 2`),
    db.execute<{ name: string; status: string; n: number }>(sql`
      select ${endpointMetric.name} as name, r.key as status, sum(r.value::int)::int as n
      from ${endpointMetric}, jsonb_each_text(${endpointMetric.rejected}) as r
      where ${window}
      group by 1, 2`),
  ]);
  const rejectedBy = new Map<string, { status: number; n: number }[]>();
  for (const r of refused.rows) {
    const list = rejectedBy.get(r.name) ?? [];
    list.push({ status: Number(r.status), n: r.n });
    rejectedBy.set(r.name, list);
  }
  const hists = new Map<string, number[]>();
  for (const r of bins.rows) {
    const h = hists.get(r.name) ?? LATENCY_BINS.map(() => 0);
    h[r.i - 1] = r.n;
    hists.set(r.name, h);
  }
  return totals
    .map((t) => {
      const hist = hists.get(t.name) ?? [];
      const rejected = (rejectedBy.get(t.name) ?? []).sort((a, b) => b.n - a.n || a.status - b.status);
      const rejectedTotal = rejected.reduce((a, r) => a + r.n, 0);
      return {
        name: t.name,
        kind: t.kind,
        count: t.count,
        errors: t.errors,
        errorRate: t.count ? t.errors / t.count : 0,
        avgMs: t.count ? Math.round(t.sumMs / t.count) : 0,
        p50: percentile(hist, 0.5, t.maxMs),
        p95: percentile(hist, 0.95, t.maxMs),
        maxMs: t.maxMs,
        rejected,
        rejectedRate: t.count ? rejectedTotal / t.count : 0,
        lastError: t.lastError,
        lastErrorAt: t.lastErrorAt ? new Date(t.lastErrorAt) : null,
      };
    })
    .sort((a, b) => b.errorRate - a.errorRate || (b.p95 ?? 0) - (a.p95 ?? 0) || a.name.localeCompare(b.name));
}

/** Thresholds past which /admin/status flags a row. */
export const SLOW_P95_MS = { route: 2000, action: 2000, page: 2000, dep: 5000 } as const;
export const ERROR_RATE_FLAG = 0.02;
/** Most calls refused, over enough calls that it isn't one person with a bad key: likely our bug. */
export const REJECTED_RATE_FLAG = 0.25;
export const REJECTED_MIN_CALLS = 20;

export const isUnhealthy = (s: MetricStats) =>
  (s.errors > 0 && s.errorRate > ERROR_RATE_FLAG) ||
  (s.p95 ?? 0) > SLOW_P95_MS[s.kind] ||
  (s.count >= REJECTED_MIN_CALLS && s.rejectedRate > REJECTED_RATE_FLAG);
