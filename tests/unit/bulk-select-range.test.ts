import { describe, expect, test } from "bun:test";
import { selectRange } from "@/app/(app)/dashboard/bulk-select";

const ids = ["a", "b", "c", "d", "e"];
const sorted = (s: Set<string>) => [...s].sort();

describe("selectRange", () => {
  test("selects from the anchor down to the clicked row", () => {
    expect(sorted(selectRange(ids, new Set(["a"]), "a", "d", true))).toEqual(["a", "b", "c", "d"]);
  });

  test("selects upward when the clicked row is above the anchor", () => {
    expect(sorted(selectRange(ids, new Set(["d"]), "d", "b", true))).toEqual(["b", "c", "d"]);
  });

  test("unticking a row with shift unticks the range", () => {
    expect(sorted(selectRange(ids, new Set(ids), "b", "d", false))).toEqual(["a", "e"]);
  });

  test("keeps selections outside the range", () => {
    expect(sorted(selectRange(ids, new Set(["e"]), "a", "b", true))).toEqual(["a", "b", "e"]);
  });

  test("without an anchor, only the clicked row changes", () => {
    expect(sorted(selectRange(ids, new Set(), null, "c", true))).toEqual(["c"]);
  });

  test("an anchor no longer in the list counts as none", () => {
    expect(sorted(selectRange(ids, new Set(), "gone", "c", true))).toEqual(["c"]);
  });

  test("doesn't change the previous set", () => {
    const prev = new Set(["a"]);
    selectRange(ids, prev, "a", "c", true);
    expect(sorted(prev)).toEqual(["a"]);
  });
});
