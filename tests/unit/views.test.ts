import { describe, expect, test } from "bun:test";
import { showsViewCountries, viewsMode } from "@/lib/views";
import { backoffMs, countCalls, type JobDef, jobStatus, type JobRow } from "@/lib/jobs";
import { blendVelocity, hotSweepInterval, MIN_SYNC, parseUmamiPath, refreshInterval, surged, syncInterval } from "@/lib/view-sync";
import { countryName, foldCountries, formatViews, totalViews } from "@/lib/views";

describe("formatViews", () => {
  test.each([
    [0, "0"],
    [999, "999"],
    [1000, "1k"],
    [1440, "1.4k"],
    [9_960, "10k"],
    [12_345, "12k"],
    [999_499, "999k"],
    [999_500, "1M"],
    [1_250_000, "1.3M"],
  ])("%d → %s", (n, s) => expect(formatViews(n)).toBe(s));
});

describe("foldCountries", () => {
  test("keeps countries with enough views, most first, and folds the rest into other", () => {
    const out = foldCountries([
      { x: "de", y: 4 },
      { x: "PH", y: 30 },
      { x: "IS", y: 1 },
      { x: null, y: 2 },
      { x: "JP", y: 4 },
    ]);
    expect(out).toEqual([
      { code: "PH", views: 30 },
      { code: "DE", views: 4 },
      { code: "JP", views: 4 },
      { code: "other", views: 3 },
    ]);
  });

  test("keeps at most ten countries", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ x: `A${String.fromCharCode(65 + i)}`, y: 100 - i }));
    const out = foldCountries(rows);
    expect(out).toHaveLength(11);
    expect(out.at(-1)).toEqual({ code: "other", views: 90 + 89 });
  });

  test("names countries in English", () => {
    expect(countryName("PH")).toBe("Philippines");
    expect(countryName("other")).toBe("Other");
  });
});

test("the total is whichever source saw more", () => {
  expect(totalViews({ umami: 1400, roam: 37 })).toBe(1400);
  expect(totalViews({ umami: 3, roam: 12 })).toBe(12);
});

describe("parseUmamiPath", () => {
  test("graph pages, with or without the slug", () => {
    expect(parseUmamiPath("/notes/abc123/weekly-review")).toEqual({ kind: "publication", graph: "notes", rootUid: "abc123" });
    expect(parseUmamiPath("/notes/abc123")).toEqual({ kind: "publication", graph: "notes", rootUid: "abc123" });
    expect(parseUmamiPath("/my%20notes/abc123/x?ref=1")).toEqual({ kind: "publication", graph: "my notes", rootUid: "abc123" });
  });

  test("collection entries by their entry uid", () => {
    expect(parseUmamiPath("/c/reading/Xy12ab/a-title")).toEqual({ kind: "entry", entryUid: "xy12ab" });
    expect(parseUmamiPath("/c/reading/xy12ab")).toEqual({ kind: "entry", entryUid: "xy12ab" });
  });

  test("everything else", () => {
    for (const p of ["/", "/notes", "/c/reading", "/a/b/c/d", "/c/a/b/c/d"]) expect(parseUmamiPath(p)).toBeNull();
  });
});

test("bigger counts wait longer between updates, never more than a day", () => {
  const h = 60 * 60_000;
  expect(refreshInterval(5)).toBe(h);
  expect(refreshInterval(500)).toBe(3 * h);
  expect(refreshInterval(5000)).toBe(12 * h);
  expect(refreshInterval(5_000_000)).toBe(24 * h);
});

describe("velocity pacing", () => {
  const h = 60 * 60_000;
  test("unknown velocity falls back to the size brackets", () => {
    expect(syncInterval(500, null)).toBe(refreshInterval(500));
  });
  test("about the time to grow 2%, between 15 minutes and a day", () => {
    expect(syncInterval(1000, 20)).toBe(h); // 20 views to go at 20 an hour
    expect(syncInterval(1000, 5)).toBe(4 * h);
    expect(syncInterval(10, 100)).toBe(MIN_SYNC);
    expect(syncInterval(100_000, 1)).toBe(24 * h);
    expect(syncInterval(50, 0)).toBe(24 * h);
  });
  test("a fast page refreshes sooner than a still one of the same size", () => {
    expect(syncInterval(20_000, 2000)).toBeLessThan(syncInterval(20_000, 10));
  });
  test("blends half the new rate with half the old, never below zero", () => {
    expect(blendVelocity(null, 30, 3 * h)).toBe(10);
    expect(blendVelocity(20, 30, 3 * h)).toBe(15);
    expect(blendVelocity(null, -5, h)).toBe(0);
    // Short gaps count as at least 15 minutes, so one burst doesn't read as thousands an hour.
    expect(blendVelocity(null, 10, 60_000)).toBe(40);
  });
  test("a surge is at least 10 views and a tenth of the count", () => {
    expect(surged(50, 9)).toBe(false);
    expect(surged(50, 10)).toBe(true);
    expect(surged(1000, 99)).toBe(false);
    expect(surged(1000, 100)).toBe(true);
  });
});

describe("hot sweep pace", () => {
  const h = 60 * 60_000;
  const base = { callsPerHour: 1000, reservedPerHour: 120, rateLimitedAt: null };
  test("every 15 minutes while the calls fit the budget", () => {
    expect(hotSweepInterval({ ...base, callsPerRun: 1 })).toBe(MIN_SYNC);
    expect(hotSweepInterval({ ...base, callsPerRun: 200 })).toBe(MIN_SYNC);
  });
  test("slows down as each run needs more calls, at most hourly", () => {
    expect(hotSweepInterval({ ...base, callsPerRun: 440 })).toBe(30 * 60_000);
    expect(hotSweepInterval({ ...base, callsPerRun: 5000 })).toBe(h);
    expect(hotSweepInterval({ ...base, callsPerHour: 100, callsPerRun: 1 })).toBe(h);
  });
  test("hourly for an hour after a rate limit", () => {
    const now = new Date();
    const at = new Date(now.getTime() - 30 * 60_000);
    expect(hotSweepInterval({ ...base, callsPerRun: 1, rateLimitedAt: at, now })).toBe(h);
    expect(hotSweepInterval({ ...base, callsPerRun: 1, rateLimitedAt: new Date(now.getTime() - 2 * h), now })).toBe(MIN_SYNC);
  });
});

describe("viewsMode", () => {
  const c = (views: "show" | "hide" | "off") => ({ views });
  test("listed pages follow their graph or collection", () => {
    expect(viewsMode(c("show"), { views: "inherit" }, true)).toBe("show");
    expect(viewsMode(c("hide"), { views: "inherit" }, true)).toBe("hide");
    expect(viewsMode(c("off"), { views: "inherit" }, true)).toBe("off");
  });
  test("unlisted pages keep the count to their managers unless set to show", () => {
    expect(viewsMode(c("show"), { views: "inherit" }, false)).toBe("hide");
    expect(viewsMode(c("show"), { views: "show" }, false)).toBe("show");
    expect(viewsMode(c("off"), { views: "inherit" }, false)).toBe("off");
  });
  test("a page's own choice wins", () => {
    expect(viewsMode(c("off"), { views: "show" }, true)).toBe("show");
    expect(viewsMode(c("show"), { views: "off" }, true)).toBe("off");
  });
  test("countries inherit too", () => {
    expect(showsViewCountries({ showViewCountries: false }, { showViewCountries: "inherit" })).toBe(false);
    expect(showsViewCountries({ showViewCountries: false }, { showViewCountries: "show" })).toBe(true);
  });
});

describe("jobs", () => {
  const job: JobDef = {
    name: "t",
    label: "T",
    description: "",
    schedule: "Hourly",
    intervalMs: 60 * 60_000,
    exclusive: true,
    disabledReason: () => null,
    run: async () => null,
  };
  const now = new Date("2026-10-03T12:00:00Z");
  const row = (patch: Partial<JobRow>): JobRow => ({
    name: "t",
    intervalMs: job.intervalMs,
    nextDueAt: new Date(now.getTime() + 1000),
    lockedUntil: null,
    lastStartedAt: now,
    lastFinishedAt: now,
    lastSuccessAt: now,
    lastDurationMs: 10,
    lastError: null,
    lastErrorAt: null,
    consecutiveFailures: 0,
    runCount: 1,
    failCount: 0,
    lastResult: null,
    cursor: {},
    ...patch,
  });

  test("status", () => {
    expect(jobStatus(job, undefined, now).kind).toBe("never");
    expect(jobStatus({ ...job, disabledReason: () => "no key" }, row({}), now)).toEqual({ kind: "disabled", reason: "no key" });
    expect(jobStatus(job, row({}), now).kind).toBe("ok");
    expect(jobStatus(job, row({ lockedUntil: new Date(now.getTime() + 1) }), now).kind).toBe("running");
    expect(jobStatus(job, row({ lockedUntil: new Date(now.getTime() - 1) }), now).kind).toBe("stalled");
    expect(jobStatus(job, row({ consecutiveFailures: 2 }), now)).toEqual({ kind: "failing", failures: 2 });
    expect(jobStatus(job, row({ nextDueAt: new Date(now.getTime() - 3 * job.intervalMs) }), now).kind).toBe("overdue");
  });

  test("backoff doubles and stops at six hours", () => {
    expect(backoffMs(60_000, 1)).toBe(120_000);
    expect(backoffMs(60_000, 3)).toBe(480_000);
    expect(backoffMs(60_000, 30)).toBe(6 * 60 * 60_000);
  });

  test("API calls are counted per UTC day", () => {
    const cursor: Record<string, unknown> = {};
    countCalls(cursor, 3, new Date("2026-10-03T23:00:00Z"));
    countCalls(cursor, 2, new Date("2026-10-03T23:30:00Z"));
    expect(cursor.callsToday).toBe(5);
    countCalls(cursor, 1, new Date("2026-10-04T00:10:00Z"));
    expect(cursor).toMatchObject({ callsDay: "2026-10-04", callsToday: 1 });
  });
});

describe("placeViewsOptions", () => {
  test("names what inheriting means for listed and unlisted pages", async () => {
    const { placeViewsOptions } = await import("@/components/manage/views-fields");
    expect(placeViewsOptions({ label: "notes", views: "show" }, true)[0].label).toBe("Inherit (Everyone)");
    const unlisted = placeViewsOptions({ label: "notes", views: "show" }, false)[0];
    expect(unlisted.label).toBe("Inherit (Private)");
    expect(unlisted.description).toContain("Unlisted");
    expect(placeViewsOptions({ label: "notes", views: "off" }, false)[0].label).toBe("Inherit (Off)");
  });
});
