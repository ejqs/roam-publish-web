import { beforeEach, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { GET as COLLECTION, PATCH as PATCH_COLLECTION } from "@/app/api/ext/collections/[id]/route";
import { PATCH as PATCH_PAGE } from "@/app/api/ext/publications/[rootUid]/route";
import { DELETE as REMOVE_ENTRY, PATCH as PATCH_ENTRY } from "@/app/api/ext/publications/[rootUid]/collections/[collectionId]/route";
import { GET as SETTINGS } from "@/app/api/ext/publications/[rootUid]/settings/route";
import { GET as STATS } from "@/app/api/ext/stats/route";
import { db } from "@/db";
import { collection, collectionEntry, pageViews, pageViewsDay, publication, publicationView, publicationVote } from "@/db/schema";
import { addEntry } from "@/lib/collections";
import { UmamiClient } from "@/lib/umami";
import { fullSweep, utcDay } from "@/lib/view-sync";
import { resetDb } from "../helpers/db";
import {
  addCollectionMember,
  addGraphMember,
  extRequest,
  keyFor,
  makeCollection,
  makeGraph,
  makePublication,
  makeUser,
} from "../helpers/factories";
import { resetRequest } from "../helpers/request";
import { fakeUmami } from "../helpers/umami";

/** Extension 0.3.0's Page settings, Collection settings and dashboard. */

const page = (rootUid: string) => ({ params: Promise.resolve({ rootUid }) }) as never;
const entry = (rootUid: string, collectionId: string) => ({ params: Promise.resolve({ rootUid, collectionId }) }) as never;
const coll = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

const settings = async (key: string, rootUid: string) =>
  SETTINGS(extRequest(`/api/ext/publications/${rootUid}/settings`, key), page(rootUid));
const patchPage = (key: string, rootUid: string, body: unknown) =>
  PATCH_PAGE(extRequest(`/api/ext/publications/${rootUid}`, key, { method: "PATCH", body }), page(rootUid));
const patchEntry = (key: string, rootUid: string, collectionId: string, body: unknown) =>
  PATCH_ENTRY(extRequest(`/api/ext/publications/${rootUid}/collections/${collectionId}`, key, { method: "PATCH", body }), entry(rootUid, collectionId));
const removeEntry = (key: string, rootUid: string, collectionId: string) =>
  REMOVE_ENTRY(extRequest(`/api/ext/publications/${rootUid}/collections/${collectionId}`, key, { method: "DELETE" }), entry(rootUid, collectionId));
const stats = async (key: string, period = "30") => STATS(extRequest(`/api/ext/stats?period=${period}`, key));

let owner: Awaited<ReturnType<typeof makeUser>>;
let g: Awaited<ReturnType<typeof makeGraph>>;
let key: string;

beforeEach(async () => {
  await resetDb();
  resetRequest();
  owner = await makeUser();
  g = await makeGraph(owner.id, { showAuthors: true, views: "hide" });
  key = await keyFor(owner.id, g);
});

describe("page settings", () => {
  test("lists the graph place and each collection with what inherit stands for", async () => {
    const p = await makePublication(g.id, owner.id, { visibility: "public" });
    const c = await makeCollection(owner.id, { name: "Essays", pdfDownload: true });
    await addEntry(c.id, p.id, owner.id);
    const res = await settings(key, p.rootUid);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.graph).toMatchObject({
      name: g.name,
      inGraph: true,
      listing: "listed",
      listingBlocked: null,
      access: "open",
      showAuthor: "inherit",
      defaults: { showAuthor: "show", views: "hide", pdfDownload: "off" },
    });
    expect(body.collections).toHaveLength(1);
    expect(body.collections[0]).toMatchObject({ id: c.id, name: "Essays", canManage: true, defaults: { pdfDownload: "on" } });
  });

  test("says why a protected page can't go on Discover", async () => {
    const p = await makePublication(g.id, owner.id, { access: "members" });
    const body = await (await settings(key, p.rootUid)).json();
    expect(body.graph.discoverBlocked).toBe("Discover is only for pages anyone can read.");
  });

  test("a member can't open settings of a page someone else published", async () => {
    const member = await makeUser();
    await addGraphMember(g.id, member.id);
    const p = await makePublication(g.id, owner.id);
    expect((await settings(await keyFor(member.id, g), p.rootUid)).status).toBe(403);
  });
});

describe("changing a page's settings", () => {
  test("byline, view count and PDF download in the graph", async () => {
    const p = await makePublication(g.id, owner.id);
    const res = await patchPage(key, p.rootUid, { showAuthor: "hide", views: "off", pdfDownload: "on" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ showAuthor: "hide", views: "off", pdfDownload: "on" });
    const after = await db.query.publication.findFirst({ where: eq(publication.id, p.id) });
    expect(after).toMatchObject({ showAuthor: "hide", views: "off", pdfDownload: "on" });
  });

  test("listing and the place settings together", async () => {
    const p = await makePublication(g.id, owner.id);
    const res = await patchPage(key, p.rootUid, { listing: "listed", showAuthor: "show" });
    expect(await res.json()).toMatchObject({ listing: "listed", showAuthor: "show" });
  });

  test("older extensions' bodies still work, and an empty one is refused", async () => {
    const p = await makePublication(g.id, owner.id);
    expect(await (await patchPage(key, p.rootUid, { visibility: "public" })).json()).toMatchObject({ visibility: "public" });
    expect(await (await patchPage(key, p.rootUid, { listing: "unlisted" })).json()).toMatchObject({ listing: "unlisted" });
    expect((await patchPage(key, p.rootUid, {})).status).toBe(400);
    expect((await patchPage(key, p.rootUid, { showAuthor: "maybe" })).status).toBe(400);
  });

});

describe("a page in a collection", () => {
  test("changes its settings there", async () => {
    const p = await makePublication(g.id, owner.id);
    const c = await makeCollection(owner.id, { indexAccess: "open", indexable: true });
    await addEntry(c.id, p.id, owner.id);
    const res = await patchEntry(key, p.rootUid, c.id, { listing: "discover", views: "show" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ listing: "discover", views: "show" });
  });

  test("refuses Discover where the collection can't list it, with the website's words", async () => {
    const p = await makePublication(g.id, owner.id);
    const c = await makeCollection(owner.id, { indexable: false });
    await addEntry(c.id, p.id, owner.id);
    const res = await patchEntry(key, p.rootUid, c.id, { listing: "discover" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Make the collection open and indexable to list its pages on Discover.");
  });

  test("a member of someone else's collection can't change an entry they didn't add", async () => {
    const p = await makePublication(g.id, owner.id);
    const other = await makeUser();
    const c = await makeCollection(other.id);
    await addCollectionMember(c.id, owner.id);
    await addEntry(c.id, p.id, other.id);
    expect((await patchEntry(key, p.rootUid, c.id, { showAuthor: "hide" })).status).toBe(409);
  });

  test("takes it out, and puts a page with no other place back in its graph", async () => {
    const p = await makePublication(g.id, owner.id, { inGraph: false });
    const c = await makeCollection(owner.id);
    await addEntry(c.id, p.id, owner.id);
    const res = await removeEntry(key, p.rootUid, c.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ removed: true, inGraph: true });
    expect(await db.query.collectionEntry.findFirst({ where: eq(collectionEntry.publicationId, p.id) })).toBeUndefined();
    expect((await removeEntry(key, p.rootUid, c.id)).status).toBe(404);
  });
});

describe("collection settings", () => {
  test("its owner reads and changes them; access stays as it was", async () => {
    const c = await makeCollection(owner.id, { name: "Notes", defaultAccess: "members", indexAccess: "open" });
    const got = await (await COLLECTION(extRequest(`/api/ext/collections/${c.id}`, key), coll(c.id))).json();
    expect(got).toMatchObject({ name: "Notes", canEdit: true, defaultAccess: "members", featuredBlocked: expect.any(String) });
    const res = await PATCH_COLLECTION(
      extRequest(`/api/ext/collections/${c.id}`, key, { method: "PATCH", body: { name: "Field notes", rss: true, views: "off" } }),
      coll(c.id),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: "Field notes", rss: true, views: "off", defaultAccess: "members" });
    const after = await db.query.collection.findFirst({ where: eq(collection.id, c.id) });
    expect(after).toMatchObject({ name: "Field notes", rss: true, defaultAccess: "members", indexAccess: "open" });
  });

  test("says why new pages can't start on Discover instead of quietly saving it off", async () => {
    const c = await makeCollection(owner.id, { defaultAccess: "members" });
    const res = await PATCH_COLLECTION(
      extRequest(`/api/ext/collections/${c.id}`, key, { method: "PATCH", body: { featured: true } }),
      coll(c.id),
    );
    expect(res.status).toBe(409);
  });

  test("members see them read-only; others get nothing", async () => {
    const other = await makeUser();
    const c = await makeCollection(other.id);
    expect((await COLLECTION(extRequest(`/api/ext/collections/${c.id}`, key), coll(c.id))).status).toBe(403);
    await addCollectionMember(c.id, owner.id);
    expect(await (await COLLECTION(extRequest(`/api/ext/collections/${c.id}`, key), coll(c.id))).json()).toMatchObject({ canEdit: false });
    const res = await PATCH_COLLECTION(extRequest(`/api/ext/collections/${c.id}`, key, { method: "PATCH", body: { rss: true } }), coll(c.id));
    expect(res.status).toBe(403);
  });
});

describe("stats", () => {
  test("pages, views by day, upvotes, countries, top pages and collections", async () => {
    const now = new Date();
    const today = utcDay(now);
    const yesterday = utcDay(new Date(now.getTime() - 86_400_000));
    const twoDaysAgo = utcDay(new Date(now.getTime() - 2 * 86_400_000));
    const a = await makePublication(g.id, owner.id, { title: "Alpha", visibility: "public" });
    const b = await makePublication(g.id, owner.id, { title: "Beta", kind: "block" });
    const [pv] = await db
      .insert(pageViews)
      .values({ publicationId: a.id, path: "/x", views: 40, countries: [{ code: "PH", views: 30 }, { code: "other", views: 10 }] })
      .returning();
    await db.insert(pageViewsDay).values([
      { pageViewsId: pv.id, day: twoDaysAgo, views: 10 },
      { pageViewsId: pv.id, day: yesterday, views: 25 },
      { pageViewsId: pv.id, day: today, views: 40 },
    ]);
    const reader = await makeUser();
    await db.insert(publicationView).values({ publicationId: b.id, userId: reader.id });
    await db.insert(publicationVote).values({ publicationId: a.id, userId: reader.id });
    const c = await makeCollection(owner.id, { name: "Shelf" });
    await addEntry(c.id, b.id, owner.id);

    const res = await stats(key, "7");
    expect(res.status).toBe(200);
    const s = await res.json();
    expect(s).toMatchObject({ period: "7", pages: 1, blocks: 1, upvotes: { total: 1, period: 1 } });
    expect(s.views.total).toBe(41);
    expect(s.views.byDay).toHaveLength(7);
    const day = (d: string) => s.views.byDay.find((x: { day: string }) => x.day === d)?.views;
    expect(day(yesterday)).toBe(15);
    // 15 from Umami today; the one signed-in Roam reader is counted beside it (the larger of the two).
    expect(day(today)).toBe(15);
    expect(day(twoDaysAgo)).toBe(0);
    expect(s.countries).toEqual([{ code: "PH", views: 30 }, { code: "other", views: 10 }]);
    expect(s.top.map((t: { title: string }) => t.title)).toEqual(["Alpha", "Beta"]);
    expect(s.collections).toEqual([expect.objectContaining({ name: "Shelf", role: "owner", pages: 1 })]);
    expect(s.publishingDays).toBeGreaterThanOrEqual(1);
  });

  test("a member only counts their own pages", async () => {
    const member = await makeUser();
    await addGraphMember(g.id, member.id);
    await makePublication(g.id, owner.id);
    await makePublication(g.id, member.id);
    const s = await (await stats(await keyFor(member.id, g))).json();
    expect(s.pages).toBe(1);
  });

  test("an unknown period is refused", async () => {
    expect((await stats(key, "year")).status).toBe(400);
  });
});

describe("views per day", () => {
  test("each sync saves the day's count", async () => {
    const p = await makePublication(g.id, owner.id, { rootUid: "aaa", visibility: "public" });
    const umami = fakeUmami(() => [{ x: `/${g.name}/aaa`, y: 12 }]);
    try {
      await fullSweep(new UmamiClient(), {});
    } finally {
      umami.restore();
    }
    const [pv] = await db.select().from(pageViews).where(eq(pageViews.publicationId, p.id));
    const days = await db.select().from(pageViewsDay).where(and(eq(pageViewsDay.pageViewsId, pv.id)));
    expect(days).toEqual([{ pageViewsId: pv.id, day: utcDay(new Date()), views: 12 }]);
  });
});
