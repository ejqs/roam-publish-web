import { beforeEach, expect, test } from "bun:test";
import { db } from "@/db";
import { publicationView, publicationVote } from "@/db/schema";
import { discoverCollections, discoverPublications } from "@/lib/discover";
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
