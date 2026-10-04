import { describe, expect, test } from "bun:test";
import type { Node } from "@/db/schema";
import { withoutShortlinks } from "@/lib/shortlinks";

const n = (uid: string, string: string, children: Node[] = []): Node => ({ uid, string, children });
const link = "[Roam Publish Status](https://roam.pub/p/AbCd2345)";
const set = { ids: new Set(["AbCd2345"]), anchors: new Set(["anchor123"]) };
const uids = (t: Node): string[] => [t.uid, ...t.children.flatMap(uids)];

describe("withoutShortlinks", () => {
  test("drops the Roam Publish block with its link and change log", () => {
    const tree = n("root", "", [
      n("tag", "[[Roam Publish]]", [n("anchor123", link, [n("e1", "[[October 2nd, 2026]] Published")])]),
      n("b1", "kept"),
    ]);
    expect(uids(withoutShortlinks(tree, set))).toEqual(["root", "b1"]);
  });

  test("drops an earlier build's block, whose Changelog block is the anchor", () => {
    const legacy = { ...set, anchors: new Set(["log1"]) };
    const tree = n("root", "", [n("tag", "#published", [n("l1", link), n("log1", "Changelog", [n("e1", "entry")])])]);
    expect(uids(withoutShortlinks(tree, legacy))).toEqual(["root"]);
  });

  test("a status link pasted under an ordinary block drops only the link", () => {
    const tree = n("root", "", [n("rel", "Related:", [n("pasted", link), n("other", "a note")])]);
    expect(uids(withoutShortlinks(tree, set))).toEqual(["root", "rel", "other"]);
  });

  test("an unknown shortlink id is left alone", () => {
    const tree = n("root", "", [n("x", "https://roam.pub/p/Zzzz9999")]);
    expect(uids(withoutShortlinks(tree, set))).toEqual(["root", "x"]);
  });
});
