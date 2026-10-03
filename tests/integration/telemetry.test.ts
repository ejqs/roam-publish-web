import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { GET as health } from "@/app/api/health/route";
import { db } from "@/db";
import { backgroundJob, endpointMetric } from "@/db/schema";
import { checkHealth } from "@/lib/health";
import { drainBuckets, record } from "@/lib/telemetry";
import { flushMetrics, isUnhealthy, METRIC_RETENTION_MS, metricStats } from "@/lib/telemetry-stats";
import { resetDb } from "../helpers/db";

const T = new Date("2026-01-01T10:00:30Z");
const NEXT_MINUTE = new Date("2026-01-01T10:01:05Z");
spyOn(console, "error").mockImplementation(() => {});

beforeEach(async () => {
  await resetDb();
  drainBuckets(new Date(8.64e15), true);
});

describe("metrics flush", () => {
  test("writes finished minutes and adds to rows already there", async () => {
    record("GET /x", "route", 20, undefined, T);
    record("GET /x", "route", 400, "boom", T);
    expect(await flushMetrics(T)).toBeNull();
    expect(await flushMetrics(NEXT_MINUTE)).toEqual({ rows: 1, calls: 2, pruned: 0 });

    record("GET /x", "route", 30, undefined, T);
    await flushMetrics(NEXT_MINUTE);
    const [row] = await db.select().from(endpointMetric);
    expect(row).toMatchObject({ count: 3, errors: 1, sumMs: 450, maxMs: 400, lastError: "boom" });
    expect(row.hist.reduce((a, b) => a + b, 0)).toBe(3);
  });

  test("stats add up across minutes and sort errors first", async () => {
    record("GET /ok", "route", 20, undefined, T);
    record("action a.b", "action", 50, undefined, T);
    record("action a.b", "action", 60, "nope", new Date(T.getTime() + 60_000));
    await flushMetrics(new Date(T.getTime() + 5 * 60_000));
    const stats = await metricStats(new Date(T.getTime() - 60 * 60_000), new Date(T.getTime() + 60 * 60_000));
    expect(stats.map((s) => s.name)).toEqual(["action a.b", "GET /ok"]);
    expect(stats[0]).toMatchObject({ kind: "action", count: 2, errors: 1, errorRate: 0.5, maxMs: 60, lastError: "nope" });
    expect(stats[0].p50).toBe(50);
  });

  test("rejected counts add up per status and flag a route most callers are refused by", async () => {
    for (let i = 0; i < 5; i++) record("POST /p", "route", 10, undefined, T);
    for (let i = 0; i < 20; i++) record("POST /p", "route", 10, undefined, T, 409);
    record("POST /p", "route", 10, undefined, T, 401);
    await flushMetrics(NEXT_MINUTE);
    for (let i = 0; i < 4; i++) record("POST /p", "route", 10, undefined, T, 409);
    await flushMetrics(NEXT_MINUTE);
    const [row] = await db.select().from(endpointMetric);
    expect(row.rejected).toEqual({ "409": 24, "401": 1 });
    const [s] = await metricStats(new Date(T.getTime() - 60_000), NEXT_MINUTE);
    expect(s).toMatchObject({ count: 30, errors: 0, rejected: [{ status: 409, n: 24 }, { status: 401, n: 1 }] });
    expect(s.rejectedRate).toBeCloseTo(25 / 30);
    expect(isUnhealthy(s)).toBe(true);
  });

  test("drops rows past retention", async () => {
    record("GET /old", "route", 5, undefined, T);
    await flushMetrics(NEXT_MINUTE);
    const res = await flushMetrics(new Date(T.getTime() + METRIC_RETENTION_MS + 120_000));
    expect(res).toMatchObject({ pruned: 1 });
    expect(await db.select().from(endpointMetric)).toHaveLength(0);
  });
});

describe("health", () => {
  test("job worker off: healthy with the database up", async () => {
    expect(await checkHealth()).toEqual({ ok: true, checks: { database: "ok", jobs: "off" } });
    const res = await health();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("job worker on: fails without a recent heartbeat", async () => {
    const was = process.env.JOBS;
    delete process.env.JOBS;
    try {
      expect((await checkHealth()).checks.jobs).toBe("fail");
      expect((await health()).status).toBe(503);
      await db.insert(backgroundJob).values({ name: "metrics-flush", intervalMs: 60_000, lastFinishedAt: new Date() });
      expect(await checkHealth()).toEqual({ ok: true, checks: { database: "ok", jobs: "ok" } });
    } finally {
      process.env.JOBS = was;
    }
  });
});
