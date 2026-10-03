import { describe, expect, test } from "bun:test";
import type { backgroundJob } from "@/db/schema";
import type { JobDef } from "@/lib/jobs";
import { impactsFrom } from "@/lib/status-banner";
import type { MetricStats } from "@/lib/telemetry-stats";

const NOW = new Date("2026-10-03T12:00:00Z");

function stat(name: string, over: Partial<MetricStats> = {}): MetricStats {
  const kind = name.startsWith("page ") ? "page" : name.startsWith("dep ") ? "dep" : name.includes(" /") ? "route" : "action";
  const s = { name, kind, count: 100, errors: 0, avgMs: 50, p50: 40, p95: 100, maxMs: 200, rejected: [], lastError: null, lastErrorAt: null, ...over } as MetricStats;
  s.errorRate = s.count ? s.errors / s.count : 0;
  s.rejectedRate = s.count ? s.rejected.reduce((a, r) => a + r.n, 0) / s.count : 0;
  return s;
}

const found = (stats: MetricStats[], jobs: Parameters<typeof impactsFrom>[1] = []) =>
  impactsFrom(stats, jobs, NOW).map((f) => `${f.key}:${f.tone}:${f.audience}`);

describe("impactsFrom", () => {
  test("healthy stats: nothing", () => {
    expect(found([stat("POST /api/ext/publications"), stat("page /p/[id]", { count: 1 })])).toEqual([]);
  });

  test("publishing: a few failures warn, most failing is critical, for signed-in people", () => {
    expect(found([stat("POST /api/ext/publications", { errors: 4 })])).toEqual(["publishing:warning:signed-in"]);
    expect(found([stat("PATCH /api/ext/publications/[rootUid]", { count: 10, errors: 6 })])).toEqual([
      "publishing:critical:signed-in",
    ]);
  });

  test("publishing: slow warns; refused calls (a revoked key) don't", () => {
    expect(found([stat("POST /api/ext/publications", { p95: 9000 })])).toEqual(["publishing:warning:signed-in"]);
    expect(found([stat("GET /api/ext/publications", { count: 30, rejected: [{ status: 401, n: 30 }] })])).toEqual([]);
  });

  test("published pages failing to render reach everyone", () => {
    expect(found([stat("page /[graph]/[uid]/[[...slug]]", { count: 3 })])).toEqual(["reading:warning:everyone"]);
    expect(found([stat("page /p/[id]", { count: 25 })])).toEqual(["reading:critical:everyone"]);
    expect(found([stat("page /c/[id]/[[...slug]]", { count: 2 })])).toEqual([]);
  });

  test("sign-in, dashboard and email", () => {
    expect(found([stat("POST /api/auth/[...all]", { errors: 50 })])).toEqual(["sign-in:critical:everyone"]);
    // Never more than a warning, however bad.
    expect(found([stat("dashboard.unpublish", { count: 10, errors: 10 })])).toEqual(["dashboard:warning:signed-in"]);
    expect(found([stat("dep resend", { count: 10, errors: 10 })])).toEqual(["email:warning:everyone"]);
  });

  test("roam-append: errors count, refusals (bad tokens) don't", () => {
    expect(found([stat("dep roam-append", { errors: 5 })])).toEqual(["roam-changelog:warning:signed-in"]);
    expect(found([stat("dep roam-append", { count: 50, rejected: [{ status: 401, n: 50 }] })])).toEqual([]);
  });

  test("a failing change log job warns", () => {
    const def = { name: "changelog-send", exclusive: false, intervalMs: 5000, disabledReason: () => null } as unknown as JobDef;
    const row = { name: "changelog-send", consecutiveFailures: 3, lastFinishedAt: NOW, lockedUntil: null } as typeof backgroundJob.$inferSelect;
    expect(found([], [{ def, row }])).toEqual(["roam-changelog:warning:signed-in"]);
  });

  test("ignores what users wouldn't notice", () => {
    const bad = { count: 50, errors: 50, p95: 60_000 };
    expect(
      found([
        stat("GET /api/search", bad),
        stat("POST /api/votes", bad),
        stat("POST /api/views", bad),
        stat("GET /discover/feed.xml", bad),
        stat("dep umami", bad),
        stat("admin.moderate", bad),
        stat("GET /api/health", bad),
        stat("page /admin/status", { count: 50 }),
      ]),
    ).toEqual([]);
  });

  test("the worst row wins for each impact", () => {
    expect(
      found([stat("GET /api/ext/publications", { errors: 4 }), stat("POST /api/ext/publications", { count: 10, errors: 9 })]),
    ).toEqual(["publishing:critical:signed-in"]);
  });
});
