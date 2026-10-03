import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { percentile } from "@/lib/telemetry-stats";
import {
  binOf,
  drainBuckets,
  isControlFlow,
  LATENCY_BINS,
  record,
  restoreBuckets,
  timed,
  withAction,
  withRoute,
} from "@/lib/telemetry";

const T = new Date("2026-01-01T10:00:30Z");
const LATER = new Date("2026-01-01T11:00:00Z");
const quiet = [spyOn(console, "error"), spyOn(console, "warn")];

beforeEach(() => {
  drainBuckets(LATER, true);
  quiet.forEach((s) => s.mockImplementation(() => {}));
});
afterEach(() => quiet.forEach((s) => s.mockReset()));

const only = (name: string) => drainBuckets(LATER, true).filter((b) => b.name === name);

describe("record", () => {
  test("adds calls in the same minute to one bucket", () => {
    record("GET /x", "route", 12, undefined, T);
    record("GET /x", "route", 300, "boom", new Date(T.getTime() + 20_000));
    const [b, ...rest] = only("GET /x");
    expect(rest).toHaveLength(0);
    expect(b).toMatchObject({ count: 2, errors: 1, sumMs: 312, maxMs: 300, lastError: "boom" });
    expect(b.minute.toISOString()).toBe("2026-01-01T10:00:00.000Z");
    expect(b.hist[binOf(12)]).toBe(1);
    expect(b.hist[binOf(300)]).toBe(1);
  });

  test("logs failures and slow calls as JSON, not fast successes", () => {
    record("GET /x", "route", 5, undefined, T);
    record("GET /x", "route", 1500, undefined, T);
    record("GET /x", "route", 5, new Error("nope"), T);
    expect(quiet[1]).toHaveBeenCalledTimes(1);
    expect(JSON.parse(quiet[0].mock.calls[0][0] as string)).toMatchObject({ level: "error", metric: "GET /x", error: "nope" });
  });

  test("drain keeps the current minute until it's over", () => {
    record("GET /x", "route", 5, undefined, T);
    expect(drainBuckets(new Date(T.getTime() + 10_000))).toHaveLength(0);
    expect(drainBuckets(new Date(T.getTime() + 60_000))).toHaveLength(1);
  });

  test("restore merges back into a bucket that got new calls", () => {
    record("GET /x", "route", 5, undefined, T);
    const drained = drainBuckets(LATER, true);
    record("GET /x", "route", 7, "late", T);
    restoreBuckets(drained);
    expect(only("GET /x")[0]).toMatchObject({ count: 2, errors: 1, sumMs: 12, lastError: "late" });
  });
});

describe("wrappers", () => {
  test("withRoute counts 5xx and throws as errors, 4xx as fine", async () => {
    const h = withRoute("GET /r", async (status: number) => {
      if (status === 0) throw new Error("crash");
      return new Response(null, { status });
    });
    await h(200);
    await h(404);
    await h(503);
    await expect(h(0)).rejects.toThrow("crash");
    expect(only("GET /r")[0]).toMatchObject({ count: 4, errors: 2, lastError: "crash" });
  });

  test("withAction counts throws, not error results, and passes the result through", async () => {
    expect(await withAction("a.b", async () => ({ ok: false, message: "bad input" }))).toEqual({ ok: false, message: "bad input" });
    await expect(withAction("a.b", async () => Promise.reject(new Error("Not authorized")))).rejects.toThrow();
    expect(only("action a.b")[0]).toMatchObject({ kind: "action", count: 2, errors: 1 });
  });

  test("redirect and notFound aren't failures", async () => {
    const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
    expect(isControlFlow(redirect)).toBe(true);
    expect(isControlFlow(new Error("x"))).toBe(false);
    await expect(withAction("a.r", async () => Promise.reject(redirect))).rejects.toBe(redirect);
    expect(only("action a.r")[0]).toMatchObject({ count: 1, errors: 0 });
  });

  test("timed uses the failure check", async () => {
    await timed("svc", async () => ({ status: 429 }), (r) => (r.status === 429 ? "limited" : undefined));
    expect(only("dep svc")[0]).toMatchObject({ kind: "dep", errors: 1, lastError: "limited" });
  });
});

describe("percentile", () => {
  test("reads the bin the percentile falls in, capped at the slowest call", () => {
    const hist = LATENCY_BINS.map(() => 0);
    hist[binOf(8)] = 90;
    hist[binOf(700)] = 10;
    expect(percentile(hist, 0.5, 720)).toBe(10);
    expect(percentile(hist, 0.95, 720)).toBe(720);
    expect(percentile([], 0.5, 0)).toBeNull();
  });
});
