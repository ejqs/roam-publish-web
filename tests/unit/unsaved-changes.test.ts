import { describe, expect, test } from "bun:test";
import { changed, linkLeavesPage } from "@/lib/unsaved-changes";

const here = "https://roam.pub/dashboard/notes/sharing";
const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };

describe("linkLeavesPage", () => {
  test("another page on the site, or another site, leaves", () => {
    expect(linkLeavesPage({ href: "/dashboard/notes/settings" }, click, here)).toBe(true);
    expect(linkLeavesPage({ href: "https://example.com/" }, click, here)).toBe(true);
    expect(linkLeavesPage({ href: "?tab=members" }, click, here)).toBe(true);
  });

  test("the same page, or a #hash on it, stays", () => {
    expect(linkLeavesPage({ href: here }, click, here)).toBe(false);
    expect(linkLeavesPage({ href: "#change-log" }, click, here)).toBe(false);
  });

  test("new tabs, downloads and modified clicks don't replace the page", () => {
    expect(linkLeavesPage({ href: "/discover", target: "_blank" }, click, here)).toBe(false);
    expect(linkLeavesPage({ href: "/export.json", download: true }, click, here)).toBe(false);
    expect(linkLeavesPage({ href: "/discover" }, { ...click, metaKey: true }, here)).toBe(false);
    expect(linkLeavesPage({ href: "/discover" }, { ...click, button: 1 }, here)).toBe(false);
    expect(linkLeavesPage({ href: "mailto:support@roam.pub" }, click, here)).toBe(false);
  });
});

describe("changed", () => {
  test("ignores key order and undefined fields", () => {
    expect(changed({ a: 1, b: [2] }, { b: [2], a: 1, c: undefined })).toBe(false);
    expect(changed({ a: 1 }, { a: 2 })).toBe(true);
  });
});
