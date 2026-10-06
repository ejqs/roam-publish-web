import { describe, expect, test } from "bun:test";
import { formatUpdated } from "@/lib/last-updated";

describe("formatUpdated", () => {
  test("writes the day the way the legal pages always have", () => {
    expect(formatUpdated("2026-10-03")).toBe("October 3rd, 2026");
    expect(formatUpdated("2026-01-01")).toBe("January 1st, 2026");
    expect(formatUpdated("2026-02-22")).toBe("February 22nd, 2026");
    expect(formatUpdated("2026-12-11")).toBe("December 11th, 2026");
    expect(formatUpdated("2026-05-13")).toBe("May 13th, 2026");
  });
});
