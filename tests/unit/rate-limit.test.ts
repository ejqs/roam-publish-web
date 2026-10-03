import { describe, expect, test } from "bun:test";
import { clientIp, rateLimit, sweepRateLimits } from "@/lib/rate-limit";

describe("clientIp", () => {
  test("prefers X-Real-IP, set by the proxy", () => {
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4" }))).toBe("203.0.113.7");
  });

  test("otherwise the last X-Forwarded-For entry, never the client-written first one", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 203.0.113.7" }))).toBe("203.0.113.7");
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  test("unknown without either", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("rateLimit", () => {
  test("allows max per window, then refuses", () => {
    const key = `t:${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 60_000)).toBe(true);
    expect(rateLimit(key, 3, 60_000)).toBe(false);
  });

  test("a new window starts fresh", () => {
    const key = `t:${Math.random()}`;
    expect(rateLimit(key, 1, -1)).toBe(true);
    expect(rateLimit(key, 1, -1)).toBe(true);
  });
});

describe("sweepRateLimits", () => {
  test("drops ended windows and keeps running ones", () => {
    const live = `t:${Math.random()}`;
    expect(rateLimit(live, 1, 60_000)).toBe(true);
    rateLimit(`t:${Math.random()}`, 1, -1);
    expect(sweepRateLimits()).toBeGreaterThanOrEqual(1);
    expect(sweepRateLimits()).toBe(0);
    // Still counted: the sweep didn't reset it.
    expect(rateLimit(live, 1, 60_000)).toBe(false);
  });

  test("everything is gone once every window has ended", () => {
    rateLimit(`t:${Math.random()}`, 1, 60_000);
    expect(sweepRateLimits(Date.now() + 2 * 60 * 60_000)).toBeGreaterThanOrEqual(1);
    expect(sweepRateLimits(Date.now() + 2 * 60 * 60_000)).toBe(0);
  });
});
