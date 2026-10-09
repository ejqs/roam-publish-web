import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { DELETE } from "@/app/api/ext/publications/[rootUid]/route";
import { POST as ADD_TO_COLLECTION } from "@/app/api/ext/publications/[rootUid]/collections/route";
import { db } from "@/db";
import { collection, collectionEntry, graph, linkPin, publication } from "@/db/schema";
import { addEntry } from "@/lib/collections";
import { hashPassword } from "@/lib/gates";
import { deleteCollection, updateCollection } from "@/server/actions/collections";
import { deleteGraph, setAccess, unpublish, updateGraphAccess, updateGraphSettings } from "@/server/actions/dashboard";
import { pinLink, unpinLink } from "@/server/actions/pins";
import {
  addToCollection,
  applyAccessToAllPages,
  bulkUnpublish,
  bulkUpdatePublications,
  removeEntry,
  updateEntry,
  updateGraphPlace,
} from "@/server/actions/places";
import { resetDb } from "../helpers/db";
import {
  actAs,
  addGraphMember,
  extRequest,
  keyFor,
  makeCollection,
  makeGraph,
  makePublication,
  makeUser,
  type TestUser,
} from "../helpers/factories";
import { resetRequest } from "../helpers/request";

let owner: TestUser, member: TestUser;
let g: typeof graph.$inferSelect;
let pub: typeof publication.$inferSelect;

const SHARED = "https://x.com/ej/status/1\nhttps://blog.example.com/post";

beforeEach(async () => {
  await resetDb();
  resetRequest();
  [owner, member] = [await makeUser(), await makeUser()];
  g = await makeGraph(owner.id);
  await addGraphMember(g.id, member.id);
  pub = await makePublication(g.id, owner.id, { visibility: "public", access: "open" });
  actAs(owner);
});

const reload = () => db.query.publication.findFirst({ where: eq(publication.id, pub.id) });
const pinPage = () => pinLink({ kind: "page", publicationId: pub.id }, SHARED);

describe("pinning", () => {
  test("saves the places, and refuses anything that isn't a link", async () => {
    expect((await pinLink({ kind: "page", publicationId: pub.id }, "not a link")).ok).toBe(false);
    expect((await pinLink({ kind: "page", publicationId: pub.id }, "")).ok).toBe(false);
    expect((await pinLink({ kind: "page", publicationId: pub.id }, "javascript:alert(1)")).ok).toBe(false);
    const res = await pinPage();
    expect(res).toEqual({ ok: true, message: "Link pinned." });
    const [row] = await db.select().from(linkPin);
    expect(row.sharedAt).toEqual(["https://x.com/ej/status/1", "https://blog.example.com/post"]);
    // Pinning again edits the same pin.
    expect((await pinLink({ kind: "page", publicationId: pub.id }, "https://a.example.com")).message).toBe("Saved where it's shared.");
    expect((await db.select().from(linkPin)).map((r) => r.sharedAt)).toEqual([["https://a.example.com"]]);
  });

  test("only people who can change the link pin or unpin it", async () => {
    const stranger = await makeUser();
    actAs(stranger);
    expect((await pinPage()).ok).toBe(false);
    actAs(owner);
    await pinPage();
    actAs(stranger);
    expect((await unpinLink({ kind: "page", publicationId: pub.id })).ok).toBe(false);
    expect(await db.select().from(linkPin)).toHaveLength(1);
    // A member manages only their own pages.
    actAs(member);
    expect((await unpinLink({ kind: "page", publicationId: pub.id })).ok).toBe(false);
    actAs(owner);
    expect((await unpinLink({ kind: "page", publicationId: pub.id })).ok).toBe(true);
    expect(await db.select().from(linkPin)).toHaveLength(0);
  });
});

describe("a pinned page link", () => {
  beforeEach(async () => {
    await pinPage();
  });

  test("can't be unpublished on the website, and the refusal says where it's shared", async () => {
    const res = await unpublish(pub.id);
    expect(res?.ok).toBe(false);
    expect(res?.message).toBe(
      `Its link in ${g.name} is pinned because you shared it at x.com/ej/status/1 and blog.example.com/post. Unpin it first.`,
    );
    expect(await reload()).toBeDefined();
  });

  test("can't be unpublished from Roam, by any extension", async () => {
    const key = await keyFor(owner.id, g);
    const res = await DELETE(extRequest(`/api/ext/publications/${pub.rootUid}`, key, { method: "DELETE" }), {
      params: Promise.resolve({ rootUid: pub.rootUid }),
    } as never);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("Unpin it on roam.pub first.");
    expect(await reload()).toBeDefined();
  });

  test("bulk unpublish skips it and names it", async () => {
    const other = await makePublication(g.id, owner.id);
    const res = await bulkUnpublish({ ids: [pub.id, other.id] });
    expect(res.ok).toBe(true);
    expect(res.message).toContain(`Skipped "${pub.title}"`);
    expect(await reload()).toBeDefined();
    expect(await db.query.publication.findFirst({ where: eq(publication.id, other.id) })).toBeUndefined();
  });

  test("can't leave its graph or get stricter, but can move between Discover, Public and Unlisted", async () => {
    await addEntry((await makeCollection(owner.id)).id, pub.id, owner.id);
    expect((await updateGraphPlace(pub.id, { inGraph: false })).ok).toBe(false);
    expect((await updateGraphPlace(pub.id, { access: "members" })).ok).toBe(false);
    expect((await setAccess(pub.id, "unlisted"))?.ok).toBe(true);
    expect((await setAccess(pub.id, "public"))?.ok).toBe(true);
    const after = await reload();
    expect(after!.inGraph).toBe(true);
    expect(after!.access).toBe("open");
  });

  test("a Password page keeps its password, and can still open up", async () => {
    await db.update(publication).set({ access: "password", passwordHash: hashPassword("first password") }).where(eq(publication.id, pub.id));
    expect((await updateGraphPlace(pub.id, { password: "another password" })).ok).toBe(false);
    expect((await updateGraphPlace(pub.id, { access: "members" })).ok).toBe(false);
    expect((await updateGraphPlace(pub.id, { access: "open" })).ok).toBe(true);
  });

  test("bulk and apply-to-all access changes keep it as it is", async () => {
    await db.update(graph).set({ passwordHash: hashPassword("graph password") }).where(eq(graph.id, g.id));
    const other = await makePublication(g.id, owner.id, { access: "open" });
    const res = await bulkUpdatePublications({ ids: [pub.id, other.id], read: "members" });
    expect(res.message).toContain("1 page with a pinned link kept who can read it");
    expect((await reload())!.access).toBe("open");
    const all = await applyAccessToAllPages("graph", g.id, "password");
    expect(all.message).toContain("pinned link");
    expect((await reload())!.access).toBe("open");
    expect((await db.query.publication.findFirst({ where: eq(publication.id, other.id) }))!.access).toBe("password");
  });

  test("can't be taken out of its graph by joining a collection that takes pages out", async () => {
    const c = await makeCollection(owner.id, { pagesLeaveGraph: true });
    const res = await addToCollection(pub.id, c.id);
    expect(res.ok).toBe(false);
    expect(res.message).toContain("takes added pages out of their graph");
    const key = await keyFor(owner.id, g);
    const ext = await ADD_TO_COLLECTION(extRequest(`/api/ext/publications/${pub.rootUid}/collections`, key, { body: { collectionId: c.id } }), {
      params: Promise.resolve({ rootUid: pub.rootUid }),
    } as never);
    expect(ext.status).toBe(409);
    expect((await reload())!.inGraph).toBe(true);
  });

  test("keeps its graph from being deleted", async () => {
    const res = await deleteGraph(g.id, g.name);
    expect(res?.ok).toBe(false);
    expect(res?.message).toContain("Unpin it first.");
    expect(await reload()).toBeDefined();
  });

  test("keeps the graph password while it uses it", async () => {
    await db.update(graph).set({ passwordHash: hashPassword("graph password") }).where(eq(graph.id, g.id));
    await db.update(publication).set({ access: "password" }).where(eq(publication.id, pub.id));
    const res = await updateGraphAccess(g.id, {
      indexAccess: "open",
      defaultAccess: "open",
      encryptNewPages: false,
      password: "a brand new password",
      clearPassword: false,
    });
    expect(res?.ok).toBe(false);
    expect(res?.message).toContain("uses the");
  });

  test("everything works again once it's unpinned", async () => {
    expect((await unpinLink({ kind: "page", publicationId: pub.id })).ok).toBe(true);
    expect((await unpublish(pub.id))?.ok).toBe(true);
    expect(await reload()).toBeUndefined();
  });
});

describe("a pinned collection link", () => {
  test("can't be removed or made stricter, and keeps its collection", async () => {
    const c = await makeCollection(owner.id);
    const entry = (await addEntry(c.id, pub.id, owner.id))!;
    await pinLink({ kind: "entry", entryId: entry.id }, SHARED);
    expect((await removeEntry(entry.id)).ok).toBe(false);
    expect((await updateEntry(entry.id, { access: "members" })).ok).toBe(false);
    expect((await updateEntry(entry.id, { listing: "unlisted" })).ok).toBe(true);
    expect((await deleteCollection(c.id)).ok).toBe(false);
    // And the page itself can't be unpublished while one of its links is pinned.
    const res = await unpublish(pub.id);
    expect(res?.message).toContain(`Its link in ${c.name} is pinned`);
    expect(await db.query.collectionEntry.findFirst({ where: eq(collectionEntry.id, entry.id) })).toBeDefined();
  });
});

describe("pinned front pages and collection pages", () => {
  test("a front page can't be turned off or made stricter", async () => {
    await pinLink({ kind: "front", graphId: g.id }, SHARED);
    expect((await updateGraphSettings(g.id, { frontPage: false }))?.ok).toBe(false);
    const res = await updateGraphAccess(g.id, {
      indexAccess: "members",
      defaultAccess: "members",
      encryptNewPages: false,
      password: "",
      clearPassword: false,
    });
    expect(res?.message).toBe(`The ${g.name} front page is pinned because you shared it at x.com/ej/status/1 and blog.example.com/post. Unpin it first.`);
    expect((await deleteGraph(g.id, g.name))?.ok).toBe(false);
    expect((await db.query.graph.findFirst({ where: eq(graph.id, g.id) }))!.indexAccess).toBe("open");
  });

  test("a collection's page can't be made stricter, and the collection can't be deleted", async () => {
    const c = await makeCollection(owner.id);
    await pinLink({ kind: "collection", collectionId: c.id }, SHARED);
    const res = await updateCollection(c.id, {
      name: c.name,
      description: "",
      indexAccess: "members",
      defaultAccess: "members",
      encryptNewPages: false,
      password: "",
      clearPassword: false,
      showAuthors: false,
      views: "show",
      showViewCountries: true,
      indexable: true,
      searchListed: true,
      featured: false,
      discoverable: false,
      rss: false,
    });
    expect(res.ok).toBe(false);
    expect((await deleteCollection(c.id)).ok).toBe(false);
    expect((await db.query.collection.findFirst({ where: eq(collection.id, c.id) }))!.indexAccess).toBe("open");
  });
});
