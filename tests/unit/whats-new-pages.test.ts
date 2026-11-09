import { describe, expect, test } from "bun:test";
import type { Entry } from "@/lib/whats-new";
import { byRelease, heatLevel, heatmap, heatmapWeeks, pageCount, pageOf, pageSlice, parsePage } from "@/lib/whats-new-pages";

const at = (iso: string) => new Date(iso);
const entry = (id: string, stampedAt: string, version: string | null = null): Entry => ({
  id,
  source: "web",
  date: at(stampedAt.slice(0, 10) + "T00:00:00Z"),
  stampedAt: at(stampedAt),
  version,
  kind: "new",
  area: "Site",
  text: id,
});

describe("pages", () => {
  // 25 releases of two entries each, newest first.
  const entries = Array.from({ length: 25 }, (_, r) => [0, 1].map((i) => entry(`web-r${r}e${i}`, new Date(Date.UTC(2026, 10, 9) - r * 86_400_000).toISOString()))).flat();
  const releases = byRelease(entries);

  test("a release's entries stay together", () => {
    expect(releases.length).toBe(25);
    expect(releases.every((r) => r.entries.length === 2)).toBe(true);
  });

  test("ten releases a page", () => {
    expect(pageCount(releases.length)).toBe(3);
    expect(pageCount(0)).toBe(1);
    expect(pageSlice(releases, 3).length).toBe(5);
    expect(pageSlice(releases, 2)[0]).toBe(releases[10]);
  });

  test("?page= falls back to the nearest page that exists", () => {
    expect(parsePage("2", 3)).toBe(2);
    expect(parsePage("9", 3)).toBe(3);
    expect(parsePage("0", 3)).toBe(1);
    expect(parsePage("x", 3)).toBe(1);
    expect(parsePage(["2"], 3)).toBe(1);
    expect(parsePage(undefined, 3)).toBe(1);
  });

  test("an entry's page", () => {
    expect(pageOf(releases, "web-r0e1")).toBe(1);
    expect(pageOf(releases, "web-r10e0")).toBe(2);
    expect(pageOf(releases, "web-r24e1")).toBe(3);
    expect(pageOf(releases, "web-missing")).toBe(null);
  });
});

describe("heat map", () => {
  test("levels", () => {
    expect([0, 1, 2, 3, 5, 6, 9, 10, 40].map(heatLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  test("weeks of seven UTC days, Monday first, ending this week", () => {
    const now = at("2026-11-09T13:00:00Z"); // A Monday.
    const weeks = heatmap(
      [entry("web-a", "2026-11-09T10:00:00Z", "0.28.3"), entry("web-b", "2026-11-09T09:00:00Z", "0.28.2"), entry("web-c", "2026-11-03T23:59:00Z"), entry("web-old", "2025-01-01T00:00:00Z")],
      now,
      (e) => (e.version ? `Website ${e.version}` : null),
      4,
    );
    expect(weeks.length).toBe(4);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0][0].day.toISOString()).toBe("2026-10-19T00:00:00.000Z");
    const today = weeks[3][0];
    expect(today).toMatchObject({ count: 2, level: 1, versions: ["Website 0.28.3", "Website 0.28.2"], first: "web-a", future: false });
    expect(weeks[2][1]).toMatchObject({ count: 1, first: "web-c" });
    expect(weeks[3][1].future).toBe(true);
    expect(weeks.flat().reduce((n, d) => n + d.count, 0)).toBe(3);
  });
});

test("the map goes back to the first change, 12 to 26 weeks", () => {
  const now = at("2026-11-09T13:00:00Z");
  expect(heatmapWeeks([], now)).toBe(12);
  expect(heatmapWeeks([entry("web-a", "2026-10-01T00:00:00Z")], now)).toBe(12);
  expect(heatmapWeeks([entry("web-a", "2026-06-01T00:00:00Z")], now)).toBe(24);
  expect(heatmapWeeks([entry("web-a", "2024-01-01T00:00:00Z")], now)).toBe(26);
});
