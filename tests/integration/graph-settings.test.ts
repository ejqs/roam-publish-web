import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { updateGraphAccess, updateGraphSettings } from "@/app/(app)/dashboard/actions";
import { updateCollection } from "@/app/(app)/dashboard/collections/actions";
import { db } from "@/db";
import { collection, graph } from "@/db/schema";
import { addEntry } from "@/lib/collections";
import { hashPassword } from "@/lib/gates";
import { resetDb } from "../helpers/db";
import { actAs, makeCollection, makeGraph, makePublication, makeUser } from "../helpers/factories";

beforeEach(resetDb);

const read = (id: string) => db.query.graph.findFirst({ where: eq(graph.id, id) });

// The Settings tab saves the description and the Sharing tab the listing switches: neither may
// reset what the other owns.
test("saving one tab's settings keeps the other's", async () => {
  const owner = await makeUser();
  const g = await makeGraph(owner.id, { frontPage: true, indexable: true, rss: true });
  actAs(owner);

  expect((await updateGraphSettings(g.id, { description: "Notes" }))?.ok).toBe(true);
  expect(await read(g.id)).toMatchObject({ description: "Notes", frontPage: true, rss: true });

  expect((await updateGraphSettings(g.id, { indexable: false }))?.ok).toBe(true);
  expect(await read(g.id)).toMatchObject({ description: "Notes", indexable: false, frontPage: true });
});

test("turning off the front page still turns off the feed", async () => {
  const owner = await makeUser();
  const g = await makeGraph(owner.id, { frontPage: true, indexable: true, rss: true });
  actAs(owner);

  expect((await updateGraphSettings(g.id, { frontPage: false }))?.ok).toBe(true);
  expect(await read(g.id)).toMatchObject({ frontPage: false, rss: false });
});

test("only the owner can change them", async () => {
  const owner = await makeUser();
  const g = await makeGraph(owner.id, { description: "Mine" });
  actAs(await makeUser());

  expect((await updateGraphSettings(g.id, { description: "Theirs" }))?.ok).toBe(false);
  expect(await read(g.id)).toMatchObject({ description: "Mine" });
});

// Search only reaches an open front page, so locking hides these switches without forgetting them.
test("locking a graph keeps its search settings for when it opens again", async () => {
  const owner = await makeUser();
  const g = await makeGraph(owner.id, { indexable: true, searchListed: true, passwordHash: hashPassword("graph-password-1") });
  actAs(owner);
  const res = await updateGraphAccess(g.id, {
    indexAccess: "password",
    defaultAccess: "password",
    showAuthors: true,
    views: "show",
    showViewCountries: true,
    newPagesInGraph: true,
    encryptNewPages: false,
    defaultCollections: [],
    password: "",
    clearPassword: false,
  });
  expect(res?.ok).toBe(true);
  expect(await read(g.id)).toMatchObject({ indexAccess: "password", indexable: true, searchListed: true });
});

describe("collection settings", () => {
  const save = (c: typeof collection.$inferSelect, extra: Record<string, unknown> = {}) =>
    updateCollection(c.id, {
      name: c.name,
      description: "",
      indexAccess: "open",
      defaultAccess: "open",
      showAuthors: true,
      views: "show",
      showViewCountries: true,
      indexable: true,
      searchListed: true,
      featured: true,
      encryptNewPages: false,
      discoverable: false,
      rss: false,
      password: "",
      clearPassword: false,
      ...extra,
    });
  const readC = (id: string) => db.query.collection.findFirst({ where: eq(collection.id, id) });

  test("locking keeps its search settings, and turns off new pages on Discover", async () => {
    const owner = await makeUser();
    const c = await makeCollection(owner.id, { passwordHash: hashPassword("collection-pw-1") });
    actAs(owner);
    expect((await save(c, { indexAccess: "password", defaultAccess: "password" })).ok).toBe(true);
    expect(await readC(c.id)).toMatchObject({ indexable: true, searchListed: true, featured: false });
  });

  test("List new pages on Discover starts added pages on Discover", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    const c = await makeCollection(owner.id);
    actAs(owner);
    expect((await save(c)).ok).toBe(true);
    expect((await readC(c.id))!.featured).toBe(true);
    const entry = await addEntry(c.id, (await makePublication(g.id, owner.id)).id, owner.id);
    expect(entry).toMatchObject({ listing: "discover" });
  });
});
