import { beforeEach, describe, expect, test } from "bun:test";
import { asc, eq } from "drizzle-orm";
import GraphFrontPage from "@/app/[graph]/page";
import CPage from "@/app/c/[id]/[[...slug]]/page";
import { saveArrangement } from "@/app/(app)/dashboard/arrange-actions";
import { FrontPage, type FrontCard, type FrontFolder } from "@/components/front-page";
import { PageList } from "@/components/page-list";
import { db } from "@/db";
import { collection, collectionEntry, folder, graph, publication } from "@/db/schema";
import { addEntry } from "@/lib/collections";
import { resetDb } from "../helpers/db";
import { actAs, makeCollection, makeGraph, makePublication, makeUser } from "../helpers/factories";
import { findElements, renderNested } from "../helpers/render";
import { resetRequest } from "../helpers/request";

beforeEach(async () => {
  await resetDb();
  resetRequest();
});

const foldersOf = (graphId: string) => db.select().from(folder).where(eq(folder.graphId, graphId)).orderBy(asc(folder.position));
const front = (out: unknown) => findElements(out as never, FrontPage)[0]?.props as
  | { cards: FrontCard[]; folders: FrontFolder[]; chain: FrontFolder[] }
  | undefined;
const graphFront = (name: string, search: Record<string, string> = {}) =>
  GraphFrontPage({ params: Promise.resolve({ graph: name }), searchParams: Promise.resolve(search) } as never);

describe("saveArrangement", () => {
  test("saves folders, nesting, pages and the layout", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    const a = await makePublication(g.id, owner.id, { title: "PyRevit/Smart-Button", visibility: "public" });
    const b = await makePublication(g.id, owner.id, { title: "Loose", visibility: "public" });
    actAs(owner);
    const res = await saveArrangement(
      { kind: "graph", id: g.id },
      {
        layout: "explorer",
        folders: [
          { id: "new-1", name: "PyRevit", parentId: null },
          { id: "new-2", name: "Buttons", parentId: "new-1" },
        ],
        moves: { [a.id]: "new-2", [b.id]: null },
      },
    );
    expect(res.ok).toBe(true);
    const saved = await foldersOf(g.id);
    expect(saved.map((f) => [f.name, f.slug])).toEqual([
      ["PyRevit", "pyrevit"],
      ["Buttons", "pyrevit-buttons"],
    ]);
    expect(saved[1].parentId).toBe(saved[0].id);
    expect((await db.query.publication.findFirst({ where: eq(publication.id, a.id) }))?.folderId).toBe(saved[1].id);
    expect((await db.query.graph.findFirst({ where: eq(graph.id, g.id) }))?.frontLayout).toBe("explorer");

    // Renaming keeps the folder and its pages; leaving one out deletes it and its pages go loose.
    const res2 = await saveArrangement(
      { kind: "graph", id: g.id },
      { layout: "shelves", folders: [{ id: saved[1].id, name: "Tools", parentId: null }], moves: {} },
    );
    expect(res2.ok).toBe(true);
    const after = await foldersOf(g.id);
    expect(after.map((f) => [f.id, f.name, f.slug, f.parentId])).toEqual([[saved[1].id, "Tools", "tools", null]]);
    expect((await db.query.publication.findFirst({ where: eq(publication.id, a.id) }))?.folderId).toBe(saved[1].id);
  });

  test("only the owner can arrange, and only their own pages", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    const other = await makeUser();
    const theirs = await makeGraph(other.id);
    const theirPage = await makePublication(theirs.id, other.id, { visibility: "public" });
    actAs(other);
    expect((await saveArrangement({ kind: "graph", id: g.id }, { layout: "list", folders: [], moves: {} })).ok).toBe(false);
    actAs(owner);
    const res = await saveArrangement(
      { kind: "graph", id: g.id },
      { layout: "shelves", folders: [{ id: "n", name: "Mine", parentId: null }], moves: { [theirPage.id]: "n" } },
    );
    expect(res.ok).toBe(true);
    expect((await db.query.publication.findFirst({ where: eq(publication.id, theirPage.id) }))?.folderId).toBeNull();
  });

  test("refuses what Save would be disabled for", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    actAs(owner);
    const res = await saveArrangement(
      { kind: "graph", id: g.id },
      { layout: "shelves", folders: [{ id: "a", name: "Same", parentId: null }, { id: "b", name: "same", parentId: null }], moves: {} },
    );
    expect(res).toEqual({ ok: false, message: 'Two folders side by side are both called "same".' });
  });

  test("collections arrange their entries", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    const c = await makeCollection(owner.id);
    const p = await makePublication(g.id, owner.id, { title: "Walls" });
    await addEntry(c.id, p.id, owner.id);
    const [entry] = await db.select().from(collectionEntry).where(eq(collectionEntry.collectionId, c.id));
    actAs(owner);
    const res = await saveArrangement(
      { kind: "collection", id: c.id },
      { layout: "explorer", folders: [{ id: "x", name: "Revit API", parentId: null }], moves: { [entry.id]: "x" } },
    );
    expect(res.ok).toBe(true);
    const [f] = await db.select().from(folder).where(eq(folder.collectionId, c.id));
    expect((await db.query.collectionEntry.findFirst({ where: eq(collectionEntry.id, entry.id) }))?.folderId).toBe(f.id);
    expect((await db.query.collection.findFirst({ where: eq(collection.id, c.id) }))?.frontLayout).toBe("explorer");

    actAs(null);
    const page = await CPage({ params: Promise.resolve({ id: c.slug, slug: undefined }), searchParams: Promise.resolve({ folder: "revit-api" }) } as never);
    const props = front(await renderNested(page, "CollectionIndex"));
    expect(props?.chain.map((x) => x.name)).toEqual(["Revit API"]);
    expect(props?.cards.map((x) => x.title)).toEqual(["Walls"]);
  });
});

describe("front page folders", () => {
  async function setup() {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    const [py] = await db.insert(folder).values({ graphId: g.id, name: "PyRevit", slug: "pyrevit" }).returning();
    await db.insert(folder).values({ graphId: g.id, name: "Empty", slug: "empty", position: 1 });
    await makePublication(g.id, owner.id, { title: "PyRevit/Smart-Button", visibility: "public", folderId: py.id, searchText: "buttons" });
    await makePublication(g.id, owner.id, { title: "Loose page", visibility: "public", searchText: "buttons too" });
    await makePublication(g.id, owner.id, { title: "PyRevit/Hidden", visibility: "unlisted", folderId: py.id });
    return { owner, g };
  }

  test("the top shows folders with listed pages, then loose pages", async () => {
    const { g } = await setup();
    actAs(null);
    const props = front(await graphFront(g.name))!;
    expect(props.cards.map((c) => c.title)).toEqual(["Loose page"]);
    const py = props.folders.find((f) => f.name === "PyRevit")!;
    expect([py.n, py.titles]).toEqual([1, ["Smart-Button"]]);
    expect(props.folders.find((f) => f.name === "Empty")?.n).toBe(0);
  });

  test("a folder shows its pages with short titles; a search reaches every folder", async () => {
    const { g } = await setup();
    actAs(null);
    expect(front(await graphFront(g.name, { folder: "pyrevit" }))!.cards.map((c) => [c.title, c.folder])).toEqual([["Smart-Button", undefined]]);
    const found = front(await graphFront(g.name, { q: "buttons" }))!.cards.map((c) => [c.title, c.folder]).sort();
    expect(found).toEqual([
      ["Loose page", undefined],
      ["Smart-Button", "PyRevit"],
    ]);
  });

  test("the List layout keeps the table of every page", async () => {
    const { g } = await setup();
    await db.update(graph).set({ frontLayout: "list" }).where(eq(graph.id, g.id));
    actAs(null);
    const out = await graphFront(g.name);
    expect(front(out)).toBeUndefined();
    expect(findElements(out as never, PageList)[0].props.rows).toHaveLength(2);
  });
});
