import { describe, expect, test } from "bun:test";
import { clientIp, rateLimit } from "@/lib/rate-limit";

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
