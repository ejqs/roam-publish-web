import { afterEach, describe, expect, test } from "bun:test";
import { throttleDelay, umamiCallsPerHour, umamiCallsPerWindow } from "@/lib/umami";

describe("Umami budget", () => {
  const saved = process.env.UMAMI_CALLS_PER_HOUR;
  afterEach(() => {
    if (saved === undefined) delete process.env.UMAMI_CALLS_PER_HOUR;
    else process.env.UMAMI_CALLS_PER_HOUR = saved;
  });

  test("defaults to 80% of 50 calls every 15 seconds", () => {
    delete process.env.UMAMI_CALLS_PER_HOUR;
    expect(umamiCallsPerWindow()).toBe(40);
    expect(umamiCallsPerHour()).toBe(9600);
  });

  test("UMAMI_CALLS_PER_HOUR spreads evenly over each 15 seconds", () => {
    process.env.UMAMI_CALLS_PER_HOUR = "2400";
    expect(umamiCallsPerWindow()).toBe(10);
    expect(umamiCallsPerHour()).toBe(2400);
    process.env.UMAMI_CALLS_PER_HOUR = "100";
    expect(umamiCallsPerWindow()).toBe(1);
  });
});

describe("throttleDelay", () => {
  test("no wait under the limit", () => {
    expect(throttleDelay([1000, 2000], 3000, 3, 15_000)).toBe(0);
  });
  test("at the limit, waits until the oldest call in the window leaves it", () => {
    expect(throttleDelay([1000, 2000, 3000], 4000, 3, 15_000)).toBe(12_000);
  });
  test("calls older than the window don't count", () => {
    expect(throttleDelay([0, 20_000, 21_000], 22_000, 3, 15_000)).toBe(0);
  });
});
