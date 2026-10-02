import { beforeEach, describe, expect, test } from "bun:test";
import GraphFrontPage from "@/app/[graph]/page";
import CPage from "@/app/c/[id]/[[...slug]]/page";
import { PageList } from "@/components/page-list";
import { db } from "@/db";
import { collectionEntry } from "@/db/schema";
import { searchPages } from "@/lib/site-search";
import { resetDb } from "../helpers/db";
import { actAs, makeCollection, makeGraph, makePublication, makeUser } from "../helpers/factories";
import { findElements, renderNested, textOf } from "../helpers/render";
import { resetRequest } from "../helpers/request";
import { indexFields } from "@/lib/tags";
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

const rowsOf = (out: unknown) => findElements(out as never, PageList).flatMap((e) => e.props.rows as unknown[]);

beforeEach(async () => {
  await resetDb();
  resetRequest();
});

describe("graph front page search", () => {
  for (const access of ["password", "members"] as const)
    // BUG (high): the front page search matches and excerpts protected pages' text.
    test.failing(`doesn't reveal the text of ${access} pages to anonymous readers`, async () => {
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

describe("collection front page search", () => {
  // BUG (high): same as the graph front page.
  test.failing("doesn't reveal the text of password pages to anonymous readers", async () => {
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
});
