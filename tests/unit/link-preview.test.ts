import { describe, expect, test } from "bun:test";
import { privacyNotes } from "@/components/privacy-icons";
import type { Node } from "@/db/schema";
import { cardVersion, excerpt, linkedPages, type PreviewCard, previewMetadata, readMinutes } from "@/lib/link-preview";

const node = (string: string, children: Node[] = []): Node => ({ uid: string.slice(0, 9) || "root", string, children });
const tree = (...children: Node[]) => node("", children);

const open: Extract<PreviewCard, { locked: false }> = {
  locked: false,
  container: "TTC",
  title: "Match Parameters",
  description: "Included in PyRevit",
  author: "@ejqs",
  tags: ["pyrevit"],
  minutes: 1,
  links: ["PyRevit"],
  publishedAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
};

describe("excerpt", () => {
  test("joins plain text and cuts at the limit", () => {
    const t = tree(node("Related: [[PyRevit]] and **Revit**"), node("Second"));
    expect(excerpt(t)).toBe("Related: PyRevit and Revit Second");
    expect(excerpt(t, 10)).toBe("Related: P…");
  });
});

describe("linkedPages", () => {
  test("first seen first, without duplicates, the page itself or code", () => {
    const t = tree(
      node("See [[PyRevit]] and #[[Revit API]]", [node("Again [[pyrevit]], `[[not a ref]]` and [[Match Parameters]]")]),
      node("[[Revit]]"),
    );
    expect(linkedPages(t, "Match Parameters")).toEqual(["PyRevit", "Revit API", "Revit"]);
  });

  test("stops at the limit", () => {
    const t = tree(...["a", "b", "c", "d", "e", "f"].map((x) => node(`[[${x}]]`)));
    expect(linkedPages(t, "", 5)).toEqual(["a", "b", "c", "d", "e"]);
  });
});

test("readMinutes is at least one", () => {
  expect(readMinutes("")).toBe(1);
  expect(readMinutes("word ".repeat(1000))).toBe(5);
});

describe("cardVersion", () => {
  test("changes with the card", () => {
    expect(cardVersion(open)).toBe(cardVersion({ ...open }));
    expect(cardVersion(open)).not.toBe(cardVersion({ ...open, title: "Other" }));
  });
});

describe("previewMetadata", () => {
  test("an open page shares its title, text and reading time", () => {
    const m = previewMetadata(open, { path: "/TTC/abc/match-parameters", image: "/api/og/page/TTC/abc?v=1" });
    expect(m.openGraph).toMatchObject({ type: "article", title: "Match Parameters", siteName: "TTC · Roam Publish" });
    expect(m.description).toBe("Included in PyRevit");
    expect(m.other).toMatchObject({ "twitter:data1": "1 min read", "twitter:data2": "@ejqs" });
  });

  test("a protected page shares nothing from the page", () => {
    const m = previewMetadata({ locked: true, container: "TTC" }, { path: "/TTC/abc", image: "/api/og/page/TTC/abc?v=1" });
    expect(JSON.stringify(m)).not.toContain("Match Parameters");
    expect(m.description).toBeUndefined();
    expect(m.openGraph?.title).toBe("Protected page");
  });
});

describe("privacyNotes", () => {
  const base = { container: "TTC", encrypted: false, unlisted: false };
  test("nothing for an open, listed page", () => {
    expect(privacyNotes({ ...base, access: "open" })).toEqual([]);
  });
  test("encrypted replaces password, and unlisted comes last", () => {
    expect(privacyNotes({ ...base, access: "password", encrypted: true, unlisted: true }).map((n) => n.kind)).toEqual([
      "encrypted",
      "unlisted",
    ]);
    expect(privacyNotes({ ...base, access: "members" }).map((n) => n.kind)).toEqual(["members"]);
  });
  test("a listed page out of search says so; an unlisted one only says unlisted", () => {
    expect(privacyNotes({ ...base, access: "password", unsearchable: true }).map((n) => n.kind)).toEqual([
      "password",
      "unsearchable",
    ]);
    expect(privacyNotes({ ...base, access: "open", unlisted: true, unsearchable: true }).map((n) => n.kind)).toEqual([
      "unlisted",
    ]);
  });
});
