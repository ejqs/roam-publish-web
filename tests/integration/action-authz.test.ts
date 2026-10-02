import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { generateKey } from "@/app/(app)/dashboard/keys/actions";
import { deleteGraph, setAccess, unpublish } from "@/app/(app)/dashboard/actions";
import { setAppendToken } from "@/app/(app)/dashboard/[graph]/settings/change-log-actions";
import { deleteCollection, moveEntry } from "@/app/(app)/dashboard/collections/actions";
import { inviteByEmail, removeMemberAction } from "@/app/(app)/dashboard/member-actions";
import {
  applyAccessToAllPages,
  bulkUpdatePublications,
  removeEntry,
  updateEntry,
  updateGraphPlace,
} from "@/app/(app)/dashboard/place-actions";
import { setPageTags } from "@/app/(app)/dashboard/tag-actions";
import { db } from "@/db";
import { apikey, collection, collectionEntry, graph, graphMember, publication } from "@/db/schema";
import { addEntry } from "@/lib/collections";
import { resetDb } from "../helpers/db";
import {
  actAs,
  addCollectionMember,
  addGraphMember,
  makeCollection,
  makeGraph,
  makePublication,
  makeUser,
  type TestUser,
} from "../helpers/factories";
import { resetRequest } from "../helpers/request";

let owner: TestUser, member: TestUser, stranger: TestUser;
let g: typeof graph.$inferSelect;
let pub: typeof publication.$inferSelect;

beforeEach(async () => {
  await resetDb();
  resetRequest();
  [owner, member, stranger] = [await makeUser(), await makeUser(), await makeUser()];
  g = await makeGraph(owner.id);
  await addGraphMember(g.id, member.id);
  await makeGraph(stranger.id); // a verified person, so only ownership stops them
  pub = await makePublication(g.id, owner.id, { visibility: "unlisted" });
});

const reload = () => db.query.publication.findFirst({ where: eq(publication.id, pub.id) });

describe("pages in someone else's graph", () => {
  for (const who of ["stranger", "member"] as const)
    test(`a ${who} can't unpublish, list, protect, hide, retag or bulk-change the owner's page`, async () => {
      actAs(who === "stranger" ? stranger : member);
      await unpublish(pub.id);
      // setAccess answers "Saved." either way; what matters is that nothing changed (checked below).
      await setAccess(pub.id, "public");
      expect((await updateGraphPlace(pub.id, { access: "members" })).ok).toBe(false);
      expect((await setPageTags(pub.id, { add: ["x"] })).ok).toBe(false);
      expect((await bulkUpdatePublications({ ids: [pub.id], reach: "discover" })).ok).toBe(false);
      const after = await reload();
      expect(after).toBeDefined();
      expect(after!.visibility).toBe("unlisted");
      expect(after!.access).toBe("inherit");
      expect(after!.tagsAdded).toEqual([]);
    });

  test("signed out, every action refuses", async () => {
    actAs(null);
    await unpublish(pub.id);
    expect((await setAccess(pub.id, "public"))?.ok).toBe(false);
    expect((await updateGraphPlace(pub.id, { access: "members" })).ok).toBe(false);
    expect(await reload()).toBeDefined();
  });

  test("the owner can", async () => {
    actAs(owner);
    expect((await setAccess(pub.id, "public"))?.ok).toBe(true);
    expect((await reload())!.visibility).toBe("public");
  });
});

describe("graph settings", () => {
  test("only the owner deletes the graph, changes all pages' access or adds a token", async () => {
    for (const u of [member, stranger]) {
      actAs(u);
      expect((await deleteGraph(g.id, g.name)).ok).toBe(false);
      expect((await applyAccessToAllPages("graph", g.id, "members")).ok).toBe(false);
      expect((await setAppendToken(g.id, { token: "roam-graph-token-x", date: "10-02-2026", timeZone: "UTC" })).ok).toBe(false);
    }
    expect(await db.query.graph.findFirst({ where: eq(graph.id, g.id) })).toBeDefined();
    expect((await reload())!.access).toBe("inherit");
  });

  test("a stranger can't get a key for the graph", async () => {
    actAs(stranger);
    expect((await generateKey(g.id)).ok).toBe(false);
    expect(await db.select().from(apikey)).toHaveLength(0);
  });

  test("only the owner invites or removes members", async () => {
    actAs(stranger);
    expect((await inviteByEmail("graph", g.id, stranger.email)).ok).toBe(false);
    expect((await removeMemberAction("graph", g.id, member.id)).ok).toBe(false);
    actAs(member);
    expect((await removeMemberAction("graph", g.id, owner.id)).ok).toBe(false);
    expect(await db.select().from(graphMember)).toHaveLength(1);
  });
});

describe("collections", () => {
  test("a collection member manages only entries they added; strangers nothing", async () => {
    const c = await makeCollection(owner.id);
    await addCollectionMember(c.id, member.id);
    const entry = (await addEntry(c.id, pub.id, owner.id))!;
    for (const u of [member, stranger]) {
      actAs(u);
      expect((await updateEntry(entry.id, { listing: "unlisted" })).ok).toBe(false);
      expect((await moveEntry(entry.id, 1)).ok).toBe(false);
      expect((await deleteCollection(c.id)).ok).toBe(false);
    }
    actAs(stranger);
    expect((await removeEntry(entry.id)).ok).toBe(false);
    expect(await db.query.collection.findFirst({ where: eq(collection.id, c.id) })).toBeDefined();
    const e = await db.query.collectionEntry.findFirst({ where: eq(collectionEntry.id, entry.id) });
    expect(e?.listing).toBe("listed");
  });
});
