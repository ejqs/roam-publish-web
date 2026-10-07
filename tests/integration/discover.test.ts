import { beforeEach, expect, test } from "bun:test";
import { db } from "@/db";
import { collectionEntry, publicationView, publicationVote } from "@/db/schema";
import { discoverCollections, discoverPublications, discoverTags, excerpt, ownListedCount } from "@/lib/discover";
import { resetDb } from "../helpers/db";
import { makeCollection, makeGraph, makePublication, makeUser } from "../helpers/factories";

beforeEach(resetDb);

// Every sort runs the full query against the real schema; a column added elsewhere (say a `views`
// setting on graph or publication) must not make its computed columns ambiguous.
for (const sort of ["recent", "trending", "top"] as const)
  test(`the ${sort} list runs and counts views and votes`, async () => {
    const owner = await makeUser();
    const reader = await makeUser();
    const g = await makeGraph(owner.id);
    const p = await makePublication(g.id, owner.id, { visibility: "public", discoverable: true });
    await db.insert(publicationView).values({ publicationId: p.id, userId: reader.id });
    await db.insert(publicationVote).values({ publicationId: p.id, userId: reader.id });
    const out = await discoverPublications(sort, 10, 0);
    expect(out.rows).toEqual([expect.objectContaining({ rootUid: p.rootUid, views: 1, votes: 1 })]);
  });

test.each(["recent", "trending", "top"] as const)("the collections list runs sorted by %s", async (sort) => {
  expect(await discoverCollections(sort, 24, 0)).toEqual({ total: 0, rows: [] });
});

test("collections rank by their pages and only show open pages' titles", async () => {
  const owner = await makeUser();
  const reader = await makeUser();
  const g = await makeGraph(owner.id);
  const quiet = await makeCollection(owner.id, { discoverable: true, name: "Quiet" });
  const liked = await makeCollection(owner.id, { discoverable: true, name: "Liked" });
  await makeCollection(owner.id, { name: "Not listed" });
  const open = await makePublication(g.id, owner.id, { title: "Open page" });
  const locked = await makePublication(g.id, owner.id, { title: "Locked page" });
  const other = await makePublication(g.id, owner.id, { title: "Quiet page" });
  const entry = (collectionId: string, p: { id: string; rootUid: string }, uid: string, access: "inherit" | "password" = "inherit") =>
    db.insert(collectionEntry).values({ collectionId, publicationId: p.id, entryUid: uid, access, originGraphName: g.name, originRootUid: p.rootUid });
  await entry(liked.id, open, "likedopen01");
  await entry(liked.id, locked, "likedlock01", "password");
  await entry(quiet.id, other, "quietpage01");
  await db.insert(publicationVote).values({ publicationId: open.id, userId: reader.id });

  const top = await discoverCollections("top", 24, 0);
  expect(top.total).toBe(2);
  expect(top.rows.map((c) => [c.name, c.pages, c.votes])).toEqual([
    ["Liked", 2, 1],
    ["Quiet", 1, 0],
  ]);
  expect(top.rows[0].titles).toEqual(["Open page"]);
  const recent = await discoverCollections("recent", 24, 0);
  expect(recent.rows.map((c) => c.name)).toEqual(["Quiet", "Liked"]);
});

test("rows carry the start of the page's text, without a repeated title", async () => {
  const owner = await makeUser();
  const g = await makeGraph(owner.id);
  await makePublication(g.id, owner.id, {
    visibility: "public",
    discoverable: true,
    title: "Weekly review",
    searchText: "Weekly review\nWhat went well\nWhat to change",
  });
  const { rows } = await discoverPublications("recent", 10, 0);
  expect(rows[0].excerpt).toBe("What went well What to change");
});

test("long excerpts are cut with an ellipsis", () => {
  const out = excerpt("word ".repeat(100), "Title");
  expect(out.length).toBeLessThanOrEqual(241);
  expect(out.endsWith("…")).toBe(true);
});

test("tags are counted over listed pages only, most used first", async () => {
  const owner = await makeUser();
  const g = await makeGraph(owner.id);
  const listed = { visibility: "public", discoverable: true } as const;
  await makePublication(g.id, owner.id, { ...listed, tags: ["a", "b"] });
  await makePublication(g.id, owner.id, { ...listed, tags: ["b"] });
  await makePublication(g.id, owner.id, { tags: ["hidden"] });
  expect(await discoverTags()).toEqual(["b", "a"]);
});

test("own listed count covers the owner's graphs, not other people's", async () => {
  const owner = await makeUser();
  const other = await makeUser();
  const g = await makeGraph(owner.id);
  await makePublication(g.id, owner.id, { visibility: "public", discoverable: true });
  await makePublication(g.id, owner.id);
  expect(await ownListedCount(owner.id)).toBe(1);
  expect(await ownListedCount(other.id)).toBe(0);
});
