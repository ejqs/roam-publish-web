import { beforeEach, expect, test } from "bun:test";
import { db } from "@/db";
import { publicationView, publicationVote } from "@/db/schema";
import { discoverCollections, discoverPublications, discoverTags, excerpt, ownListedCount } from "@/lib/discover";
import { resetDb } from "../helpers/db";
import { makeGraph, makePublication, makeUser } from "../helpers/factories";

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

test("the collections list runs", async () => {
  expect(await discoverCollections()).toEqual(expect.any(Array));
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
