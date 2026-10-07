import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { GET, POST } from "@/app/api/ext/publications/[rootUid]/collections/route";
import { GET as LIST, POST as PUBLISH } from "@/app/api/ext/publications/route";
import { db } from "@/db";
import { collectionEntry, graph, graphDefaultCollection, publication } from "@/db/schema";
import { addToCollection } from "@/app/(app)/dashboard/place-actions";
import { resetDb } from "../helpers/db";
import { actAs, addCollectionMember, addGraphMember, extRequest, keyFor, makeCollection, makeGraph, makeUser, payload } from "../helpers/factories";
import { resetRequest } from "../helpers/request";

const publish = (key: string, body: unknown) => PUBLISH(extRequest("/api/ext/publications", key, { body }));
const path = (rootUid: string) => `/api/ext/publications/${rootUid}/collections`;
const ctx = (rootUid: string) => ({ params: Promise.resolve({ rootUid }) }) as never;
const list = (key: string, rootUid: string) => GET(extRequest(path(rootUid), key), ctx(rootUid));
const add = (key: string, rootUid: string, collectionId: string) =>
  POST(extRequest(path(rootUid), key, { body: { collectionId } }), ctx(rootUid));
const pubOf = (rootUid: string) => db.query.publication.findFirst({ where: eq(publication.rootUid, rootUid) });

let owner: Awaited<ReturnType<typeof makeUser>>;
let g: Awaited<ReturnType<typeof makeGraph>>;
let ownerKey: string;

beforeEach(async () => {
  await resetDb();
  resetRequest();
  owner = await makeUser();
  g = await makeGraph(owner.id);
  ownerKey = await keyFor(owner.id, g);
});

describe("listing collections for a page", () => {
  test("shows the holder's collections, how a page starts in each, and which already have it", async () => {
    const open = await makeCollection(owner.id, { name: "Writing" });
    await makeCollection(owner.id, { name: "Best of", featured: true });
    await makeCollection(owner.id, { name: "Private", defaultAccess: "password" });
    const someoneElse = await makeCollection((await makeUser()).id, { name: "Not mine" });
    const p = payload();
    await publish(ownerKey, p);
    await add(ownerKey, p.rootUid, open.id);

    const res = await list(ownerKey, p.rootUid);
    expect(res.status).toBe(200);
    const { collections } = await res.json();
    const byName = Object.fromEntries(collections.map((c: { name: string }) => [c.name, c]));
    expect(Object.keys(byName).sort()).toEqual(["Best of", "Private", "Writing"]);
    expect(byName.Writing.entryUrl).toContain("/c/");
    expect(byName["Best of"]).toMatchObject({ listing: "discover", access: "open", entryUrl: null, movesOutOfGraph: false });
    expect(byName.Private).toMatchObject({ listing: "listed", access: "password", movesOutOfGraph: true });
    expect(someoneElse.id).toBeTruthy();
  });

  test("404s for a page that isn't published", async () => {
    expect((await list(ownerKey, "nope")).status).toBe(404);
  });
});

describe("collection count", () => {
  test("publish and the published list say how many collections the holder can add to", async () => {
    const p = payload();
    expect((await (await publish(ownerKey, p)).json()).collections).toBe(0);
    await makeCollection(owner.id);
    await makeCollection(owner.id, { suspendedAt: new Date() });
    expect((await (await publish(ownerKey, p)).json()).collections).toBe(1);
    expect((await (await LIST(extRequest("/api/ext/publications", ownerKey))).json()).collections).toBe(1);
  });
});

describe("adding a page to a collection", () => {
  test("uses the collection's defaults and keeps the page in its graph when the collection is open", async () => {
    const c = await makeCollection(owner.id, { featured: true });
    const p = payload();
    await publish(ownerKey, p);
    const res = await add(ownerKey, p.rootUid, c.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ listing: "discover", access: "open", movedOutOfGraph: false });
    expect(body.url).toContain(`/${g.name}/`);
    expect((await pubOf(p.rootUid))!.inGraph).toBe(true);
  });

  test("moves the page out of its open graph when the collection is password-protected", async () => {
    const c = await makeCollection(owner.id, { defaultAccess: "password", passwordHash: "x" });
    const p = payload();
    await publish(ownerKey, p);
    const body = await (await add(ownerKey, p.rootUid, c.id)).json();
    expect(body).toMatchObject({ access: "password", movedOutOfGraph: true });
    expect(body.url).toBe(body.entryUrl);
    expect((await pubOf(p.rootUid))!.inGraph).toBe(false);
  });

  test("keeps the graph place when the graph is already as strict", async () => {
    await db.update(graph).set({ defaultAccess: "password", passwordHash: "x" }).where(eq(graph.id, g.id));
    const c = await makeCollection(owner.id, { defaultAccess: "password", passwordHash: "y" });
    const p = payload();
    await publish(ownerKey, p);
    expect((await (await add(ownerKey, p.rootUid, c.id)).json()).movedOutOfGraph).toBe(false);
    expect((await pubOf(p.rootUid))!.inGraph).toBe(true);
  });

  test("refuses a collection the holder isn't in, a second add, and encrypted pages", async () => {
    const theirs = await makeCollection((await makeUser()).id);
    const mine = await makeCollection(owner.id);
    const p = payload();
    await publish(ownerKey, p);
    expect((await add(ownerKey, p.rootUid, theirs.id)).status).toBe(403);
    expect((await add(ownerKey, p.rootUid, mine.id)).status).toBe(200);
    expect((await add(ownerKey, p.rootUid, mine.id)).status).toBe(409);
    const q = payload();
    await publish(ownerKey, q);
    await db.update(publication).set({ encrypted: true }).where(eq(publication.rootUid, q.rootUid));
    const other = await makeCollection(owner.id);
    const res = await add(ownerKey, q.rootUid, other.id);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("encrypted");
  });

  test("a member adds their own pages to collections they belong to, not other people's", async () => {
    const m = await makeUser();
    await addGraphMember(g.id, m.id);
    const memberKey = await keyFor(m.id, g);
    const c = await makeCollection(owner.id);
    await addCollectionMember(c.id, m.id);
    const mine = payload();
    await publish(memberKey, mine);
    const ownersPage = payload();
    await publish(ownerKey, ownersPage);
    expect((await add(memberKey, mine.rootUid, c.id)).status).toBe(200);
    expect((await add(memberKey, ownersPage.rootUid, c.id)).status).toBe(403);
    const [entry] = await db.select().from(collectionEntry).where(eq(collectionEntry.collectionId, c.id));
    expect(entry.addedBy).toBe(m.id);
  });
});

describe("Take added pages out of their graph", () => {
  test("an open collection with it on takes the page out of its graph, from the extension and the website", async () => {
    const c = await makeCollection(owner.id, { name: "Only here", pagesLeaveGraph: true });
    const p = payload();
    await publish(ownerKey, p);
    const { collections } = await (await list(ownerKey, p.rootUid)).json();
    expect(collections[0]).toMatchObject({ access: "open", movesOutOfGraph: true });
    expect(await (await add(ownerKey, p.rootUid, c.id)).json()).toMatchObject({ movedOutOfGraph: true });
    expect((await pubOf(p.rootUid))!.inGraph).toBe(false);

    const q = payload();
    await publish(ownerKey, q);
    actAs(owner);
    const res = await addToCollection((await pubOf(q.rootUid))!.id, c.id);
    expect(res).toMatchObject({ ok: true, message: "Added to Only here, and taken out of the graph." });
    expect((await pubOf(q.rootUid))!.inGraph).toBe(false);
  });

  test("new pages joining it as a default collection start outside the graph", async () => {
    const c = await makeCollection(owner.id, { pagesLeaveGraph: true });
    await db.insert(graphDefaultCollection).values({ graphId: g.id, collectionId: c.id });
    const p = payload();
    await publish(ownerKey, p);
    expect((await pubOf(p.rootUid))!.inGraph).toBe(false);
  });
});
