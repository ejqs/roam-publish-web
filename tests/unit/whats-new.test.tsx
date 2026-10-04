import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ChangeText } from "@/app/updates/change-text";
import {
  type Entry,
  mergeEntries,
  newSince,
  parseChangelog,
  parseSeen,
  plainChange,
  seenValue,
} from "@/lib/whats-new";
import { findElements, textOf } from "../helpers/render";

spyOn(console, "error").mockImplementation(() => {});
const EXT = readFileSync("tests/fixtures/extension-changelog.md", "utf8");
const WEB = readFileSync("CHANGELOG.md", "utf8");
const day = (s: string) => new Date(`${s}T00:00:00Z`);

describe("parseChangelog", () => {
  test("the website's file: one entry per bullet, dated by its section", () => {
    const entries = parseChangelog(WEB, "web");
    expect(entries.length).toBeGreaterThan(10);
    expect(entries.every((e) => e.source === "web" && e.version === null && e.area && e.text)).toBe(true);
    // Every bullet says what kind of change it is (CLAUDE.md); the kind isn't left in the text.
    expect(entries.filter((e) => !e.kind).map((e) => e.text)).toEqual([]);
    expect(entries.some((e) => /^(New|Improved|Fixed):/.test(e.text))).toBe(false);
    expect(entries.some((e) => e.text.startsWith("**What's new** at `/updates`"))).toBe(true);
    // Continuation lines join the bullet.
    expect(entries.find((e) => e.text.startsWith("**What's new**"))!.text).toContain("you haven't seen.");
  });

  test("the extension's file: versions and dates; Unreleased needs a date", () => {
    const undated = parseChangelog(EXT, "ext");
    expect(undated.length).toBeGreaterThan(5);
    expect(undated.every((e) => e.version === "0.1.0" && e.date.getTime() === day("2026-10-02").getTime())).toBe(true);
    const dated = parseChangelog(EXT, "ext", day("2026-10-03"));
    const unreleased = dated.filter((e) => e.version === "Unreleased");
    expect(unreleased.length).toBeGreaterThan(5);
    expect(unreleased[0].date).toEqual(day("2026-10-03"));
    expect(unreleased[0].area).toBe("Commands");
  });

  test("ids are stable, differ by source, and survive a move to another section or kind", () => {
    const md = "## 2026-10-01\n\n### A\n- Same text\n";
    expect(parseChangelog(md, "web")[0].id).toBe(parseChangelog(md, "web")[0].id);
    expect(parseChangelog(md, "web")[0].id).not.toBe(parseChangelog(md, "ext")[0].id);
    const moved = parseChangelog("## 0.2.0 (2026-10-09)\n\n### B\n- Fixed: Same text\n", "web")[0];
    expect(moved.id).toBe(parseChangelog(md, "web")[0].id);
  });

  test("kinds", () => {
    const md = "## 2026-10-01\n\n### A\n- New: One\n- Improved: Two\n- Fixed: Three\n- Plain\n- Newer: not a kind\n";
    expect(parseChangelog(md, "web").map((x) => [x.kind, x.text])).toEqual([
      ["new", "One"],
      ["improved", "Two"],
      ["fixed", "Three"],
      [null, "Plain"],
      [null, "Newer: not a kind"],
    ]);
  });
});

const e = (source: "web" | "ext", date: string, text: string, stampedAt?: string): Entry => {
  const x = parseChangelog(`## ${date}\n\n### X\n- ${text}\n`, source)[0];
  return stampedAt ? { ...x, stampedAt: new Date(stampedAt) } : x;
};

describe("merge and seen", () => {
  test("newest stamp first; the website first at the same time", () => {
    const merged = mergeEntries(
      [e("web", "2026-10-01", "w1"), e("web", "2026-10-03", "w3", "2026-10-03T10:00:00Z")],
      [e("ext", "2026-10-03", "x3", "2026-10-03T10:00:00Z"), e("ext", "2026-10-03", "x4", "2026-10-03T15:00:00Z")],
    );
    expect(merged.map((x) => x.text)).toEqual(["x4", "w3", "x3", "w1"]);
  });

  test("first visit: nothing is new", () => {
    expect(newSince([e("web", "2026-10-03", "a")], parseSeen(undefined)).size).toBe(0);
    expect(parseSeen("garbage")).toBeNull();
  });

  test("only what went live after the visit is new, even on the same day", () => {
    const before = [e("web", "2026-10-02", "a"), e("web", "2026-10-03", "b", "2026-10-03T09:00:00Z")];
    expect(seenValue(before)).toBe(String(Date.parse("2026-10-03T09:00:00Z")));
    const seen = parseSeen(seenValue(before)!);
    expect(newSince(before, seen).size).toBe(0);

    const later = [...before, e("web", "2026-10-03", "c", "2026-10-03T14:30:00Z")];
    expect([...newSince(later, seen)]).toEqual([later[2].id]);
  });

  test("the old day.count cookie reads as that day's start", () => {
    const seen = parseSeen("2026-10-03.12");
    expect(seen).toEqual(day("2026-10-03"));
    // Backfilled entries of that day carry the day itself, so they're seen; a deploy later that day isn't.
    expect(newSince([e("web", "2026-10-03", "old"), e("web", "2026-10-03", "new", "2026-10-03T16:00:00Z")], seen).size).toBe(1);
  });
});

describe("rendering", () => {
  test("bold, code and safe links; nothing else becomes a link", () => {
    const text = "**[[Roam Publish]]** at `/updates`, [docs](https://example.com), [bad](javascript:alert(1)) [rel](/p/x)";
    const out = ChangeText({ text });
    const hrefs = findElements(out, "a").map((a) => a.props.href);
    expect(hrefs).toEqual(["https://example.com", "/p/x"]);
    expect(textOf(out)).not.toContain("**");
    expect(textOf(out)).toContain("[[Roam Publish]]");
    expect(plainChange("**Bold** `code` [docs](https://example.com)")).toBe("Bold code docs");
  });
});
