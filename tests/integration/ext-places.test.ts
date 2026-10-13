import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { GET as PLACES } from "@/app/api/ext/places/route";
import { POST as PUBLISH } from "@/app/api/ext/publications/route";
import { GET as SEAL } from "@/app/api/ext/publications/[rootUid]/seal/route";
import { db } from "@/db";
import { collectionEntry, graph, graphDefaultCollection, publication } from "@/db/schema";
import { updateCollection } from "@/server/actions/collections";
import { resetDb } from "../helpers/db";
import { actAs, addCollectionMember, extRequest, keyFor, makeCollection, makeGraph, makeUser, payload } from "../helpers/factories";
import { resetRequest } from "../helpers/request";

/** The extension's "Publish where?": it lists the places, then sends the pick as `to`. */

const publish = (key: string, body: unknown) => PUBLISH(extRequest("/api/ext/publications", key, { body }));
const places = async (key: string) => (await PLACES(extRequest("/api/ext/places", key))).json();
const pubOf = (rootUid: string) => db.query.publication.findFirst({ where: eq(publication.rootUid, rootUid) });
const entriesOf = async (rootUid: string) =>
  (await db.select().from(collectionEntry).where(eq(collectionEntry.publicationId, (await pubOf(rootUid))!.id))).map((e) => e.collectionId);
const seal = (key: string, rootUid: string, query: string) =>
  SEAL(extRequest(`/api/ext/publications/${rootUid}/seal?${query}`, key), { params: Promise.resolve({ rootUid }) } as never);

/** A collection's settings form: new pages start as Password and are encrypted. */
const COLLECTION_FORM = {
  description: "",
  indexAccess: "open",
  defaultAccess: "password",
  showAuthors: true,
  views: "show",
  showViewCountries: true,
  indexable: true,
  searchListed: true,
  featured: false,
  encryptNewPages: true,
  discoverable: false,
  rss: false,
  clearPassword: false,
} as const;

let owner: Awaited<ReturnType<typeof makeUser>>;
let g: Awaited<ReturnType<typeof makeGraph>>;
let key: string;

beforeEach(async () => {
  await resetDb();
  resetRequest();
  owner = await makeUser();
  g = await makeGraph(owner.id);
  key = await keyFor(owner.id, g);
});

describe("listing places", () => {
  test("the graph, the holder's collections and how a page starts in each, and where new pages go", async () => {
    const writing = await makeCollection(owner.id, { name: "Writing", featured: true });
    const joined = await makeCollection((await makeUser()).id, { name: "Joined", defaultAccess: "password" });
    await addCollectionMember(joined.id, owner.id);
    await makeCollection((await makeUser()).id, { name: "Not mine" });
    await makeCollection(owner.id, { name: "Suspended", suspendedAt: new Date() });

    const res = await places(key);
    expect(res.graph).toEqual({ name: g.name, access: g.defaultAccess, encrypted: false });
    expect(res.collections.map((c: { name: string }) => c.name).sort()).toEqual(["Joined", "Writing"]);
    expect(res.collections.find((c: { id: string }) => c.id === writing.id)).toMatchObject({ listing: "discover", access: "open", encrypted: false });
    expect(res.collections.find((c: { id: string }) => c.id === joined.id)).toMatchObject({ listing: "listed", access: "password" });
    expect(res.newPagesGoTo).toEqual(["graph"]);
  });

  test("says when New pages go to a collection instead", async () => {
    const c = await makeCollection(owner.id);
    await db.insert(graphDefaultCollection).values({ graphId: g.id, collectionId: c.id });
    await db.update(graph).set({ newPagesInGraph: false }).where(eq(graph.id, g.id));
    expect((await places(key)).newPagesGoTo).toEqual([c.id]);
  });

  test("needs a key", async () => {
    expect((await PLACES(extRequest("/api/ext/places", null))).status).toBe(401);
  });
});

describe("publishing where the publisher picked", () => {
  test("into a collection only, whatever New pages go to says", async () => {
    const c = await makeCollection(owner.id);
    const p = payload();
    const res = await publish(key, { ...p, to: [c.id] });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "created", inGraph: false });
    expect(await pubOf(p.rootUid)).toMatchObject({ inGraph: false });
    expect(await entriesOf(p.rootUid)).toEqual([c.id]);
  });

  test("to the graph only, leaving out the default collections", async () => {
    const c = await makeCollection(owner.id);
    await db.insert(graphDefaultCollection).values({ graphId: g.id, collectionId: c.id });
    const p = payload();
    await publish(key, { ...p, to: ["graph"] });
    expect(await pubOf(p.rootUid)).toMatchObject({ inGraph: true });
    expect(await entriesOf(p.rootUid)).toEqual([]);
  });

  test("refuses a collection the publisher isn't in, and publishes nothing", async () => {
    const theirs = await makeCollection((await makeUser()).id);
    const p = payload();
    const res = await publish(key, { ...p, to: [theirs.id] });
    expect(res.status).toBe(403);
    expect(await pubOf(p.rootUid)).toBeUndefined();
    expect((await seal(key, p.rootUid, `to=${theirs.id}`)).status).toBe(403);
  });

  test("a republish ignores it", async () => {
    const c = await makeCollection(owner.id);
    const p = payload();
    await publish(key, p);
    await publish(key, { ...payload({ rootUid: p.rootUid, text: "changed" }), to: [c.id] });
    expect(await pubOf(p.rootUid)).toMatchObject({ inGraph: true });
    expect(await entriesOf(p.rootUid)).toEqual([]);
  });

  test("the seal plan follows the pick: a collection that encrypts its pages", async () => {
    const c = await makeCollection(owner.id);
    actAs(owner);
    expect((await updateCollection(c.id, { ...COLLECTION_FORM, name: c.name, password: "collection-pw-1" })).ok).toBe(true);
    expect(await (await seal(key, "new1", `to=${c.id}`)).json()).toMatchObject({ encrypt: true, locks: [{ scope: "collection", id: c.id }] });
    expect(await (await seal(key, "new1", "to=graph")).json()).toEqual({ encrypt: false });
    expect((await places(key)).collections[0]).toMatchObject({ access: "password", encrypted: true });
  });
});
