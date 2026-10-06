import { describe, expect, test } from "bun:test";
import { formatUpdated } from "@/lib/last-updated";

describe("formatUpdated", () => {
  test("writes the day the way the legal pages always have", () => {
    expect(formatUpdated("2026-10-03T08:00:00.000Z")).toBe("October 3rd, 2026");
    expect(formatUpdated("2026-01-01T00:00:00.000Z")).toBe("January 1st, 2026");
    expect(formatUpdated("2026-02-22T23:59:59.000Z")).toBe("February 22nd, 2026");
    expect(formatUpdated("2026-12-11T12:00:00.000Z")).toBe("December 11th, 2026");
    expect(formatUpdated("2026-05-13T05:00:00.000Z")).toBe("May 13th, 2026");
  });
});
