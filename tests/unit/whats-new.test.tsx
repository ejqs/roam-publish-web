import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { ChangeText } from "@/app/updates/change-text";
import {
  type Entry,
  forgetWhatsNew,
  mergeEntries,
  newSince,
  parseChangelog,
  parseSeen,
  plainChange,
  seenValue,
  whatsNew,
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

  test("ids are stable and differ by source", () => {
    const md = "## 2026-10-01\n\n### A\n- Same text\n";
    expect(parseChangelog(md, "web")[0].id).toBe(parseChangelog(md, "web")[0].id);
    expect(parseChangelog(md, "web")[0].id).not.toBe(parseChangelog(md, "ext")[0].id);
  });
});

const e = (source: "web" | "ext", date: string, text: string): Entry =>
  parseChangelog(`## ${date}\n\n### X\n- ${text}\n`, source)[0];

describe("merge and seen", () => {
  test("newest first; the website first within a day", () => {
    const merged = mergeEntries([e("web", "2026-10-01", "w1"), e("web", "2026-10-03", "w3")], [e("ext", "2026-10-03", "x3")]);
    expect(merged.map((x) => x.text)).toEqual(["w3", "x3", "w1"]);
  });

  test("first visit: nothing is new", () => {
    expect(newSince([e("web", "2026-10-03", "a")], parseSeen(undefined)).size).toBe(0);
    expect(parseSeen("garbage")).toBeNull();
  });

  test("a later day is new, and so is a day that grew after the visit", () => {
    const before = [e("web", "2026-10-02", "a"), e("web", "2026-10-03", "b")];
    const seen = parseSeen(seenValue(before)!);
    expect(seenValue(before)).toBe("2026-10-03.1");
    expect(newSince(before, seen).size).toBe(0);

    const sameDay = [...before, e("ext", "2026-10-03", "c")];
    expect([...newSince(sameDay, seen)].length).toBe(2);
    const nextDay = [...before, e("web", "2026-10-04", "d")];
    expect([...newSince(nextDay, seen)]).toEqual([nextDay[2].id]);
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

describe("whatsNew", () => {
  const real = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = real;
    forgetWhatsNew();
  });

  test("merges the extension's file from GitHub, and keeps the last copy when GitHub fails", async () => {
    let up = true;
    let calls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls++;
      if (!up) return new Response("nope", { status: 503 });
      if (String(input).includes("/commits"))
        return Response.json([{ commit: { committer: { date: "2026-10-03T09:00:00Z" } } }]);
      return new Response(EXT);
    }) as typeof fetch;

    const t = Date.parse("2026-10-03T12:00:00Z");
    const first = await whatsNew(t);
    expect(first.some((x) => x.source === "ext" && x.version === "Unreleased")).toBe(true);
    expect(first.some((x) => x.source === "web")).toBe(true);
    expect(calls).toBe(2);

    // Cached for an hour.
    await whatsNew(t + 30 * 60_000);
    expect(calls).toBe(2);

    up = false;
    const later = await whatsNew(t + 2 * 60 * 60_000);
    expect(later.filter((x) => x.source === "ext")).toHaveLength(first.filter((x) => x.source === "ext").length);
  });
});
