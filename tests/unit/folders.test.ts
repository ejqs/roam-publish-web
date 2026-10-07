import { describe, expect, test } from "bun:test";
import { arrangeBlocked } from "@/lib/control-rules";
import {
  flatten,
  folderChain,
  folderSlugs,
  folderTree,
  MAX_FOLDERS,
  namespaceOf,
  subtreeIds,
  suggestFromNamespaces,
  titleInFolder,
  type FolderRow,
} from "@/lib/folders";
import { listHref, COLLECTION_LIST, parseListState } from "@/lib/list-params";

const f = (id: string, name: string, parentId: string | null = null): FolderRow => ({ id, name, parentId });

describe("folder tree", () => {
  const folders = [f("a", "PyRevit"), f("b", "Buttons", "a"), f("c", "Revit API"), f("d", "Old", "b")];

  test("nests in order, parents first", () => {
    expect(flatten(folderTree(folders)).map((n) => [n.id, n.depth])).toEqual([
      ["a", 1],
      ["b", 2],
      ["d", 3],
      ["c", 1],
    ]);
  });

  test("chains and subtrees", () => {
    expect(folderChain(folders, "d").map((x) => x.name)).toEqual(["PyRevit", "Buttons", "Old"]);
    expect(folderChain(folders, null)).toEqual([]);
    expect(subtreeIds(folders, "a").sort()).toEqual(["a", "b", "d"]);
  });

  test("slugs are unique and follow the path", () => {
    const slugs = folderSlugs([...folders, f("e", "Buttons", "c"), f("g", "PyRevit Buttons")]);
    expect(slugs.get("b")).toBe("pyrevit-buttons");
    expect(slugs.get("g")).toBe("pyrevit-buttons-2");
    expect(slugs.get("e")).toBe("revit-api-buttons");
  });
});

describe("arrangeBlocked", () => {
  test("ordinary folders save", () => {
    expect(arrangeBlocked([f("a", "One"), f("b", "Two", "a")])).toBeUndefined();
  });

  test("needs names, unique among siblings", () => {
    expect(arrangeBlocked([f("a", "  ")])).toMatch(/name/);
    expect(arrangeBlocked([f("a", "Notes"), f("b", "notes")])).toMatch(/both called/);
    expect(arrangeBlocked([f("a", "Notes"), f("b", "x", "a"), f("c", "Notes", "a")])).toBeUndefined();
  });

  test("refuses loops, missing parents and deep nesting", () => {
    expect(arrangeBlocked([f("a", "A", "b"), f("b", "B", "a")])).toMatch(/inside itself/);
    expect(arrangeBlocked([f("a", "A", "gone")])).toMatch(/no longer exists/);
    expect(arrangeBlocked([f("a", "1"), f("b", "2", "a"), f("c", "3", "b"), f("d", "4", "c")])).toMatch(/3 deep/);
  });

  test("caps the count", () => {
    expect(arrangeBlocked(Array.from({ length: MAX_FOLDERS + 1 }, (_, i) => f(`${i}`, `F${i}`)))).toMatch(/Up to/);
  });
});

describe("Roam namespaces", () => {
  test("split into folders and the rest", () => {
    expect(namespaceOf("PyRevit/Smart-Button")).toEqual({ path: ["PyRevit"], rest: "Smart-Button" });
    expect(namespaceOf("a/b/c/d/e")).toEqual({ path: ["a", "b", "c"], rest: "d/e" });
    expect(namespaceOf("No namespace")).toBeNull();
    expect(namespaceOf("http://example.com")).toBeNull();
  });

  test("titles read short inside their folder", () => {
    expect(titleInFolder("PyRevit/Smart-Button", [{ name: "PyRevit" }])).toBe("Smart-Button");
    expect(titleInFolder("PyRevit/Smart-Button", [{ name: "Other" }])).toBe("PyRevit/Smart-Button");
    expect(titleInFolder("PyRevit/", [{ name: "PyRevit" }])).toBe("PyRevit/");
  });

  test("suggest folders for loose pages, reusing ones that exist", () => {
    let n = 0;
    const { folders, moves, created } = suggestFromNamespaces(
      [f("py", "pyrevit")],
      [
        { id: "1", title: "PyRevit/Smart-Button", folderId: null },
        { id: "2", title: "Revit API/Walls", folderId: null },
        { id: "3", title: "Revit API/Doors", folderId: "py" },
        { id: "4", title: "Plain", folderId: null },
      ],
      () => `new${n++}`,
      (row) => row,
    );
    expect(created).toBe(1);
    expect(folders.map((x) => x.name)).toEqual(["pyrevit", "Revit API"]);
    expect(Object.fromEntries(moves)).toEqual({ "1": "py", "2": "new0" });
  });
});

describe("front page URLs", () => {
  test("keep the folder through search, tags and sort", () => {
    const state = parseListState(COLLECTION_LIST, { folder: "PyRevit", q: "copy" });
    expect(state.folder).toBe("pyrevit");
    expect(listHref(COLLECTION_LIST, "/c/x", state, { sort: "title" })).toBe("/c/x?folder=pyrevit&q=copy&sort=title");
    expect(parseListState(COLLECTION_LIST, { folder: "../etc" }).folder).toBeNull();
  });
});
