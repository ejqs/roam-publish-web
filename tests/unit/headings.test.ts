import { describe, expect, test } from "bun:test";
import type { Node } from "@/db/app-schema";
import { headingsOf, zoomPath } from "@/lib/headings";
import { zoomHref, zoomParam } from "@/lib/publications";

const b = (uid: string, string: string, children: Node[] = [], extra: Partial<Node> = {}): Node => ({ uid, string, children, ...extra });
const tree = [
  b("a", "Intro", [], { heading: 1 }),
  b("p", "Parent", [b("c", "Child", [b("g", "**Grandchild**", [], { heading: 2 })])]),
  b("t", "{{table}}", [b("cell", "Cell", [], { heading: 3 })]),
];

describe("page outline", () => {
  test("lists headings at any depth as plain text, skipping table cells", () => {
    expect(headingsOf(tree)).toEqual([
      { id: "h-a", text: "Intro", level: 1 },
      { id: "h-g", text: "Grandchild", level: 2 },
    ]);
  });
});

describe("zoom", () => {
  test("finds a block and the blocks above it", () => {
    expect(zoomPath(tree, "g")?.map((n) => n.uid)).toEqual(["p", "c", "g"]);
    expect(zoomPath(tree, "missing")).toBeNull();
  });

  test("links and reads ?block=", () => {
    expect(zoomHref("ab c")).toBe("?block=ab%20c");
    expect(zoomParam({ block: "g" })).toBe("g");
    expect(zoomParam({ block: ["g", "h"] })).toBeUndefined();
  });
});
