import { beforeEach, describe, expect, test } from "bun:test";
import GraphFrontPage from "@/app/[graph]/page";
import GraphTags from "@/app/[graph]/tags/page";
import GraphPage from "@/app/[graph]/[uid]/[[...slug]]/page";
import CPage from "@/app/c/[id]/[[...slug]]/page";
import { FrontPage } from "@/components/front-page";
import { PageList } from "@/components/page-list";
import { PublicationView } from "@/components/publication-view";
import { db } from "@/db";
import { collectionEntry, publication } from "@/db/schema";
import { searchPages } from "@/lib/site-search";
import { setAccess, setPageSearchable } from "@/app/(app)/dashboard/actions";
import { eq } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { actAs, makeCollection, makeGraph, makePublication, makeUser } from "../helpers/factories";
import { findElements, renderNested, textOf } from "../helpers/render";
import { resetRequest } from "../helpers/request";
import { indexFields } from "@/lib/tags";
import { addEntry } from "@/lib/collections";
import type { Node } from "@/db/schema";

const SECRET = "zanzibar";
const secretTree = (uid: string): Node => ({
  uid,
  string: "",
  children: [{ uid: `${uid}c`, string: `the launch code is ${SECRET} #hidden-tag`, children: [] }],
});

/** A public, listed page in the graph with secret text, protected by `access`. */
async function protectedPage(graphId: string, ownerId: string, access: "password" | "members") {
  const tree = secretTree(`p${access}`);
  return makePublication(graphId, ownerId, {
    rootUid: tree.uid,
    title: "Plans",
    tree,
    ...indexFields(tree),
    visibility: "public",
    access,
  });
}

// The table layout passes rows to PageList; the others pass cards to FrontPage.
const rowsOf = (out: unknown) => [
  ...findElements(out as never, PageList).flatMap((e) => e.props.rows as unknown[]),
  ...findElements(out as never, FrontPage).flatMap((e) => e.props.cards as unknown[]),
];

beforeEach(async () => {
  await resetDb();
  resetRequest();
});

describe("graph front page search", () => {
  for (const access of ["password", "members"] as const)
    test(`doesn't reveal the text of ${access} pages to anonymous readers`, async () => {
      const owner = await makeUser();
      const g = await makeGraph(owner.id);
      await protectedPage(g.id, owner.id, access);
      actAs(null);
      const out = await GraphFrontPage({
        params: Promise.resolve({ graph: g.name }),
        searchParams: Promise.resolve({ q: SECRET }),
      } as never);
      // A search for words only in the protected body must neither show an excerpt nor match the page.
      expect(textOf(rowsOf(out))).not.toContain(SECRET);
      expect(rowsOf(out)).toHaveLength(0);
    });
});

describe("graph front page search, what still works", () => {
  const search = (graphName: string, q: string) =>
    GraphFrontPage({ params: Promise.resolve({ graph: graphName }), searchParams: Promise.resolve({ q }) } as never);

  test("a protected page still matches on its title", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    await protectedPage(g.id, owner.id, "password");
    actAs(null);
    expect(rowsOf(await search(g.name, "plans"))).toHaveLength(1);
  });

  test("members search and see excerpts of protected pages", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    await protectedPage(g.id, owner.id, "members");
    actAs(owner);
    const rows = rowsOf(await search(g.name, SECRET));
    expect(rows).toHaveLength(1);
    expect(textOf(rows)).toContain(SECRET);
  });

  test("open pages are searched and excerpted for everyone", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    const tree = secretTree("openpage1");
    await makePublication(g.id, owner.id, { rootUid: tree.uid, tree, ...indexFields(tree), visibility: "public" });
    actAs(null);
    expect(textOf(rowsOf(await search(g.name, SECRET)))).toContain(SECRET);
  });

  test("protected pages' tags aren't shown to readers who can't open them", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    await protectedPage(g.id, owner.id, "password");
    const open: Node = { uid: "openpage2", string: "", children: [{ uid: "o2c", string: "hello #visible-tag", children: [] }] };
    await makePublication(g.id, owner.id, { rootUid: open.uid, tree: open, ...indexFields(open), visibility: "public" });
    actAs(null);
    const out = await search(g.name, "");
    expect(textOf(rowsOf(out))).toContain("visible-tag");
    expect(textOf(rowsOf(out))).not.toContain("hidden-tag");
    const tagsPage = await GraphTags({ params: Promise.resolve({ graph: g.name }), searchParams: Promise.resolve({}) } as never);
    expect(textOf(tagsPage)).toContain("visible-tag");
    expect(textOf(tagsPage)).not.toContain("hidden-tag");
  });
});

describe("front page cards", () => {
  test("show the start of open pages and never of protected ones", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    await protectedPage(g.id, owner.id, "password");
    const tree = secretTree("openpage3");
    await makePublication(g.id, owner.id, { rootUid: tree.uid, title: "Open", tree, ...indexFields(tree), visibility: "public" });
    actAs(null);
    const out = await GraphFrontPage({ params: Promise.resolve({ graph: g.name }), searchParams: Promise.resolve({}) } as never);
    const cards = rowsOf(out) as { title: string; excerpt?: string }[];
    expect(cards).toHaveLength(2);
    expect(cards.find((c) => c.title === "Open")?.excerpt).toContain(SECRET);
    expect(cards.find((c) => c.title === "Plans")?.excerpt).toBeUndefined();
  });
});

describe("collection front page search", () => {
  test("doesn't reveal the text of password pages to anonymous readers", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    const pub = await protectedPage(g.id, owner.id, "password");
    const c = await makeCollection(owner.id, { passwordHash: "scrypt$x$y" });
    await db.insert(collectionEntry).values({
      collectionId: c.id,
      publicationId: pub.id,
      entryUid: "entryuid01",
      access: "password",
      originGraphName: g.name,
      originRootUid: pub.rootUid,
    });
    actAs(null);
    const page = await CPage({
      params: Promise.resolve({ id: c.slug, slug: undefined }),
      searchParams: Promise.resolve({ q: SECRET }),
    } as never);
    const out = await renderNested(page, "CollectionIndex");
    expect(textOf(rowsOf(out))).not.toContain(SECRET);
    expect(rowsOf(out)).toHaveLength(0);
  });
});

describe("site search", () => {
  test("never returns protected or unlisted pages", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    await protectedPage(g.id, owner.id, "password");
    await protectedPage(g.id, owner.id, "members");
    const tree = secretTree("unlisted1");
    await makePublication(g.id, owner.id, { rootUid: tree.uid, tree, ...indexFields(tree), visibility: "unlisted" });
    const { total } = await searchPages({ q: SECRET, tags: [], sort: "best", page: 1 });
    expect(total).toBe(0);
  });

  test("finds an open, listed page", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    const tree = secretTree("open1");
    await makePublication(g.id, owner.id, { rootUid: tree.uid, tree, ...indexFields(tree), visibility: "public" });
    const { total } = await searchPages({ q: SECRET, tags: [], sort: "best", page: 1 });
    expect(total).toBe(1);
  });

  const find = () => searchPages({ q: SECRET, tags: [], sort: "best", page: 1 });

  test("leaves out a graph's Listed pages when it turns them off, but not Discoverable ones", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id, { searchListed: false });
    const listed = secretTree("listed1");
    await makePublication(g.id, owner.id, { rootUid: listed.uid, tree: listed, ...indexFields(listed), visibility: "public" });
    expect((await find()).total).toBe(0);
    const disc = secretTree("disc1");
    await makePublication(g.id, owner.id, {
      rootUid: disc.uid,
      tree: disc,
      ...indexFields(disc),
      visibility: "public",
      discoverable: true,
    });
    expect((await find()).total).toBe(1);
  });

  test("leaves out a collection's Listed pages when it turns them off, but not pages on Discover", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id, { searchListed: false });
    const c = await makeCollection(owner.id, { searchListed: false });
    const tree = secretTree("coll1");
    const pub = await makePublication(g.id, owner.id, { rootUid: tree.uid, tree, ...indexFields(tree), visibility: "public" });
    await db.insert(collectionEntry).values({
      collectionId: c.id,
      publicationId: pub.id,
      entryUid: "entryuid02",
      listing: "listed",
      originGraphName: g.name,
      originRootUid: pub.rootUid,
    });
    expect((await find()).total).toBe(0);
    await db.update(collectionEntry).set({ listing: "discover" });
    const { total, rows } = await find();
    expect(total).toBe(1);
    expect(rows[0].source.label).toBe(c.name);
  });

  test("leaves out a Listed page its owner took out of search, but never a Discoverable one", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    const tree = secretTree("hidden1");
    await makePublication(g.id, owner.id, {
      rootUid: tree.uid,
      tree,
      ...indexFields(tree),
      visibility: "public",
      searchable: false,
    });
    expect((await find()).total).toBe(0);
    await db.update(publication).set({ discoverable: true });
    expect((await find()).total).toBe(1);
  });

  test("choosing a listing moves the search switch, and Discoverable locks it on", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    const pub = await makePublication(g.id, owner.id, { visibility: "public" });
    actAs(owner);
    await setAccess(pub.id, "unlisted");
    expect((await db.query.publication.findFirst({ where: eq(publication.id, pub.id) }))!.searchable).toBe(false);
    await setAccess(pub.id, "public");
    expect((await db.query.publication.findFirst({ where: eq(publication.id, pub.id) }))!.searchable).toBe(true);
    await setAccess(pub.id, "discover");
    expect((await setPageSearchable(pub.id, false)).ok).toBe(false);
    expect((await db.query.publication.findFirst({ where: eq(publication.id, pub.id) }))!.searchable).toBe(true);
  });

  test("links to the collection when only the collection lets the page be searched", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id, { searchListed: false });
    const c = await makeCollection(owner.id);
    const tree = secretTree("coll2");
    const pub = await makePublication(g.id, owner.id, { rootUid: tree.uid, tree, ...indexFields(tree), visibility: "public" });
    await db.insert(collectionEntry).values({
      collectionId: c.id,
      publicationId: pub.id,
      entryUid: "entryuid03",
      listing: "listed",
      originGraphName: g.name,
      originRootUid: pub.rootUid,
    });
    const { rows } = await find();
    expect(rows).toHaveLength(1);
    expect(rows[0].source.label).toBe(c.name);
  });
});

describe("[[links]] between published pages", () => {
  const linkTree = (uid: string): Node => ({
    uid,
    string: "",
    children: [{ uid: `${uid}c`, string: "See [[Listed Notes]] and [[Draft Idea]]", children: [] }],
  });
  const linksOf = (out: unknown) => findElements(out as never, PublicationView)[0].props.links as Map<string, string>;

  test("lead to listed pages, never to unlisted ones, in a graph", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    const tree = linkTree("linkfrom1");
    await makePublication(g.id, owner.id, { rootUid: tree.uid, title: "Home", tree, visibility: "public" });
    await makePublication(g.id, owner.id, { rootUid: "listed001", title: "Listed Notes", visibility: "public" });
    await makePublication(g.id, owner.id, { rootUid: "draft0001", title: "Draft Idea", visibility: "unlisted" });
    actAs(null);
    const links = linksOf(await GraphPage({ params: Promise.resolve({ graph: g.name, uid: tree.uid }) } as never));
    expect(links.has("listed notes")).toBe(true);
    expect(links.has("draft idea")).toBe(false);
  });

  test("lead to listed entries, never to unlisted ones, in a collection", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    const c = await makeCollection(owner.id);
    const tree = linkTree("linkfrom2");
    const pages = [
      { rootUid: tree.uid, title: "Home", tree, listing: "listed" as const },
      { rootUid: "listed002", title: "Listed Notes", listing: "listed" as const },
      { rootUid: "draft0002", title: "Draft Idea", listing: "unlisted" as const },
    ];
    const entryUids: string[] = [];
    for (const { listing, ...p } of pages) {
      const pub = await makePublication(g.id, owner.id, { ...p, visibility: "public" });
      const entry = (await addEntry(c.id, pub.id, owner.id))!;
      await db.update(collectionEntry).set({ listing }).where(eq(collectionEntry.id, entry.id));
      entryUids.push(entry.entryUid);
    }
    actAs(null);
    const out = await CPage({ params: Promise.resolve({ id: c.slug, slug: [entryUids[0], "home"] }) } as never);
    const links = linksOf(await renderNested(out, "EntryPage"));
    expect(links.has("listed notes")).toBe(true);
    expect(links.has("draft idea")).toBe(false);
  });
});
