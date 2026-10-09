import { beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { updateGraphAccess } from "@/server/actions/dashboard";
import { updateCollection } from "@/server/actions/collections";
import GraphPage from "@/app/[graph]/[uid]/[[...slug]]/page";
import GraphFrontPage from "@/app/[graph]/page";
import { FrontPage } from "@/components/front-page";
import { GET, POST } from "@/app/api/ext/publications/route";
import { GET as SEAL } from "@/app/api/ext/publications/[rootUid]/seal/route";
import { unlockHere as unlock } from "@/lib/reader-unlock";
import { clearReaderKeys, loadReaderKey } from "@/lib/reader-keys";
import { openPage, openTitle } from "@/lib/reader-crypto";
import { encryptTitle, encryptTree, sealContentKey } from "@/lib/encryption";
import { GRAPH_PASSWORD_CANT_ENCRYPT, NO_GRAPH_PASSWORD, type SealPlan } from "@/lib/e2e-publish";
import { contentHash } from "@/lib/content-hash";
import { PublicationView } from "@/components/publication-view";
import { db } from "@/db";
import { graph, graphDefaultCollection, lockKey, type Node, publication, publicationKey } from "@/db/schema";
import { hashPassword } from "@/lib/gates";
import { resetDb } from "../helpers/db";
import { actAs, extRequest, keyFor, makeCollection, makeGraph, makeUser, type TestUser } from "../helpers/factories";
import { findElements, textOf } from "../helpers/render";
import { request, resetRequest } from "../helpers/request";

/**
 * Publishing a page encrypted in Roam (extension 0.2.0 and later): roam.pub gets a cipher and sealed
 * keys, never the text, and readers open it in their browser as before. The extension's encryption is
 * done here with the server's own functions, which use the same format.
 */

const SECRET = "zanzibar";
const GRAPH_PW = "graph-password-1";
const tree = (uid: string, text = `the launch code is ${SECRET}`): Node => ({
  uid,
  string: "",
  children: [{ uid: `${uid}c`, string: text, children: [], collapsed: true }],
});
const keyed = (n: number) => `k1.${n.toString(16).padStart(64, "0")}`;

let owner: TestUser;
let g: Awaited<ReturnType<typeof makeGraph>>;
let key: string;

beforeEach(async () => {
  await resetDb();
  resetRequest({ ip: "203.0.113.9" });
  owner = await makeUser();
  g = await makeGraph(owner.id, { passwordHash: hashPassword(GRAPH_PW), defaultAccess: "password" });
  actAs(owner);
  // Encrypt new password pages, with the password typed so it gets a key pair.
  expect(
    (await updateGraphAccess(g.id, { indexAccess: "open", defaultAccess: "password", encryptNewPages: true, password: GRAPH_PW, clearPassword: false }))?.ok,
  ).toBe(true);
  key = await keyFor(owner.id, g);
});

const plan = async (rootUid: string, { encrypt = false } = {}) =>
  (await (
    await SEAL(extRequest(`/api/ext/publications/${rootUid}/seal${encrypt ? "?encrypt=1" : ""}`, key), {
      params: Promise.resolve({ rootUid }),
    } as never)
  ).json()) as SealPlan;

const TITLE = "Plans for zanzibar";

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

/**
 * What extension 0.2.0 does: asks for the plan, encrypts the tree and title and seals their key in
 * Roam. `plainTitle`: as its first builds did, with the title sent readable.
 */
async function publishSealed(t: Node, hash: string, p?: SealPlan, { plainTitle = false, encrypt = false } = {}) {
  p ??= await plan(t.uid, { encrypt });
  if (!p.encrypt) throw new Error("not encrypted");
  const ck = randomBytes(32);
  const body = {
    rootUid: t.uid,
    kind: "page",
    ...(plainTitle && { title: TITLE }),
    folded: [`${t.uid}c`],
    contentHash: hash,
    ...(encrypt && { encrypt: true }),
    sealed: {
      publicationId: p.publicationId,
      cipher: encryptTree(ck, t, p.publicationId),
      ...(!plainTitle && { titleCipher: encryptTitle(ck, TITLE, p.publicationId) }),
      keys: p.locks.filter((l) => l.publicKey).map((l) => ({ scope: l.scope, id: l.id, publicKey: l.publicKey!, sealedKey: sealContentKey(l.publicKey!, ck) })),
    },
  };
  const res = await POST(extRequest("/api/ext/publications", key, { body }));
  return { status: res.status, body: await res.json() };
}

const row = (rootUid: string) =>
  db.query.publication.findFirst({ where: and(eq(publication.graphId, g.id), eq(publication.rootUid, rootUid)) });

async function readerSees(rootUid: string) {
  actAs(null);
  request.cookies.clear();
  await clearReaderKeys();
  await unlock({ scope: "graph", id: g.id, password: GRAPH_PW });
  const out = await GraphPage({ params: Promise.resolve({ graph: g.name, uid: rootUid }) } as never);
  const sealed = findElements(out as never, PublicationView)[0]?.props.sealed as
    | { page: { id: string; cipher: string; sealedKey: string }; lock: { scope: "graph"; id: string; version: number } }
    | undefined;
  if (!sealed) return null;
  const k = await loadReaderKey(sealed.lock, sealed.lock.version);
  const opened = k && (await openPage(sealed.page, k));
  return opened ? { ...opened, text: textOf(opened.tree) } : null;
}

describe("the seal plan", () => {
  test("a new page that will be encrypted: an id and the graph password's public key", async () => {
    const p = await plan("new1");
    expect(p).toMatchObject({ encrypt: true, locks: [{ scope: "graph", id: g.id }] });
    expect(p.encrypt && p.locks[0].publicKey).toMatch(/^[\w-]{40,}$/);
  });

  test("a new page that won't be: nothing to seal", async () => {
    await db.update(graph).set({ encryptNewPages: false }).where(eq(graph.id, g.id));
    expect(await plan("new1")).toEqual({ encrypt: false });
  });

  test("a collection that encrypts its pages, with an open graph: sealed to the collection, and kept out of the graph", async () => {
    const c = await makeCollection(owner.id);
    expect((await updateCollection(c.id, { ...COLLECTION_FORM, name: c.name, password: "collection-pw-1" })).ok).toBe(true);
    await db.update(graph).set({ defaultAccess: "open", encryptNewPages: false }).where(eq(graph.id, g.id));
    await db.insert(graphDefaultCollection).values({ graphId: g.id, collectionId: c.id });
    const p = await plan("new1");
    expect(p).toMatchObject({ encrypt: true, locks: [{ scope: "collection", id: c.id }] });
    expect((await publishSealed(tree("new1"), keyed(1), p)).status).toBe(200);
    expect(await row("new1")).toMatchObject({ encrypted: true, inGraph: false });
  });
});

describe("publishing encrypted in Roam", () => {
  test("roam.pub stores only the cipher, and the reader's browser opens it", async () => {
    const t = tree("pg1");
    const res = await publishSealed(t, keyed(1));
    expect(res.body).toMatchObject({ status: "created", encrypted: true, contentHash: keyed(1) });
    const r = (await row("pg1"))!;
    expect(r).toMatchObject({ encrypted: true, searchText: "", tags: [], needsRepublish: false, folded: ["pg1c"], contentHash: keyed(1), encryptionVersion: 2 });
    expect(JSON.stringify(r)).not.toContain(SECRET);
    expect(await db.select().from(publicationKey).where(eq(publicationKey.publicationId, r.id))).toHaveLength(1);
    expect(await readerSees("pg1")).toMatchObject({ title: TITLE });
    expect((await readerSees("pg1"))!.text).toContain(SECRET);
  });

  test("its title comes encrypted too: roam.pub only has \"Encrypted page\", in its address as well", async () => {
    const res = await publishSealed(tree("pg1"), keyed(1));
    const r = (await row("pg1"))!;
    expect(r.title).toBe("Encrypted page");
    expect(r.titleCipher).toMatch(/^v1(\.[\w-]+){3}$/);
    expect(res.body.url).toEndWith("/encrypted-page");
    const list = await (await GET(extRequest("/api/ext/publications", key))).json();
    expect(list.publications[0].title).toBe("Encrypted page");
  });

  test("its card on the graph's front page carries the title sealed, and a reader's browser with the key opens it", async () => {
    await publishSealed(tree("pg1"), keyed(1));
    await db.update(publication).set({ visibility: "public" }).where(eq(publication.rootUid, "pg1"));
    actAs(null);
    request.cookies.clear();
    await clearReaderKeys();
    await unlock({ scope: "graph", id: g.id, password: GRAPH_PW });
    const out = await GraphFrontPage({ params: Promise.resolve({ graph: g.name }), searchParams: Promise.resolve({}) } as never);
    const [card] = findElements(out as never, FrontPage)[0].props.cards as { title: string; sealedTitle?: { page: never; lock: { scope: "graph"; id: string; version: number } } }[];
    expect(card.title).toBe("Encrypted page");
    const k = await loadReaderKey(card.sealedTitle!.lock, card.sealedTitle!.lock.version);
    expect(await openTitle(card.sealedTitle!.page, k!)).toBe(TITLE);
  });

  test("from 0.2.0's first builds, with the title sent readable: kept as it was sent", async () => {
    await publishSealed(tree("pg1"), keyed(1), undefined, { plainTitle: true });
    expect(await row("pg1")).toMatchObject({ title: TITLE, titleCipher: null });
    expect(await readerSees("pg1")).toMatchObject({ title: null });
  });

  test("republishing: the same keyed hash is unchanged, a new one replaces the content", async () => {
    await publishSealed(tree("pg1"), keyed(1));
    expect((await publishSealed(tree("pg1"), keyed(1))).body.status).toBe("unchanged");
    expect((await publishSealed(tree("pg1", "now it's 42"), keyed(2))).body.status).toBe("updated");
    expect((await readerSees("pg1"))!.text).toContain("now it's 42");
    // The extension compares the keyed hash it sent.
    const list = await (await GET(extRequest("/api/ext/publications", key))).json();
    expect(list.publications[0]).toMatchObject({ contentHash: keyed(2), encrypted: true });
  });

  test("older extensions can still republish it in plain; roam.pub encrypts it then", async () => {
    await publishSealed(tree("pg1"), keyed(1));
    const t = tree("pg1", "plain again");
    const { contentHash } = await import("@/lib/content-hash");
    const body = { rootUid: "pg1", kind: "page", title: TITLE, tree: t, contentHash: contentHash({ kind: "page", title: TITLE, tree: t }) };
    expect((await (await POST(extRequest("/api/ext/publications", key, { body }))).json()).status).toBe("updated");
    expect((await readerSees("pg1"))!.text).toContain("plain again");
    // Its title is encrypted again, by roam.pub this time.
    expect(await readerSees("pg1")).toMatchObject({ title: TITLE });
    expect((await row("pg1"))!.title).toBe("Encrypted page");
    // roam.pub saw the text this time: back to encryption 1.
    expect((await row("pg1"))!.encryptedBy).toMatch(/^roam\.pub \d+\.\d+\.\d+$/);
    expect((await row("pg1"))!.encryptionVersion).toBe(1);
  });

  test("asks to reseal when the passwords changed since the plan", async () => {
    const p = await plan("pg1");
    if (!p.encrypt) throw new Error("not encrypted");
    const stale = { ...p, locks: p.locks.map((l) => ({ ...l, publicKey: l.publicKey!.slice(0, -2) + "AA" })) };
    const res = await publishSealed(tree("pg1"), keyed(1), stale);
    expect(res).toMatchObject({ status: 409, body: { reseal: true } });
    expect(await row("pg1")).toBeUndefined();
  });

  test("asks to reseal a page that isn't encrypted any more", async () => {
    const p = await plan("pg1");
    await db.update(graph).set({ encryptNewPages: false }).where(eq(graph.id, g.id));
    expect(await publishSealed(tree("pg1"), keyed(1), p)).toMatchObject({ status: 409, body: { reseal: true } });
  });

  test("won't take another page's id", async () => {
    const first = await publishSealed(tree("pg1"), keyed(1));
    expect(first.status).toBe(200);
    const p = await plan("pg2");
    const id = (await row("pg1"))!.id;
    if (!p.encrypt) throw new Error("not encrypted");
    expect(await publishSealed(tree("pg2"), keyed(2), { ...p, publicationId: id })).toMatchObject({ status: 409 });
  });
});

describe("Publish with encryption", () => {
  // New pages usually go to the graph open and unencrypted; the graph password can encrypt.
  beforeEach(async () => {
    await db.update(graph).set({ defaultAccess: "open", encryptNewPages: false }).where(eq(graph.id, g.id));
  });

  const plainBody = (t: Node) => {
    const title = "Plans";
    return { rootUid: t.uid, kind: "page", title, tree: t, contentHash: contentHash({ kind: "page", title, tree: t }), encrypt: true };
  };

  test("the plan seals a new page to the graph password, whatever new pages usually do", async () => {
    expect(await plan("new1")).toEqual({ encrypt: false });
    expect(await plan("new1", { encrypt: true })).toMatchObject({ encrypt: true, encryptBlocked: null, locks: [{ scope: "graph", id: g.id }] });
  });

  test("goes to the graph as a Password page, encrypted in Roam", async () => {
    expect((await publishSealed(tree("new1"), keyed(1), undefined, { encrypt: true })).body).toMatchObject({ status: "created", encrypted: true });
    expect(await row("new1")).toMatchObject({ encrypted: true, inGraph: true, access: "password", encryptionVersion: 2 });
    expect((await readerSees("new1"))?.text).toContain(SECRET);
  });

  test("from a Roam that can't encrypt, roam.pub encrypts it", async () => {
    const res = await POST(extRequest("/api/ext/publications", key, { body: plainBody(tree("new1")) }));
    expect(await res.json()).toMatchObject({ status: "created", encrypted: true });
    const r = (await row("new1"))!;
    expect(r).toMatchObject({ encrypted: true, inGraph: true, access: "password" });
    expect(JSON.stringify(r.tree)).not.toContain(SECRET);
  });

  test("without a graph password: says how to set one, and publishes nothing", async () => {
    await db.update(graph).set({ passwordHash: null }).where(eq(graph.id, g.id));
    expect(await plan("new1", { encrypt: true })).toEqual({ encrypt: false, encryptBlocked: NO_GRAPH_PASSWORD });
    const res = await POST(extRequest("/api/ext/publications", key, { body: plainBody(tree("new1")) }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(NO_GRAPH_PASSWORD);
    expect(await row("new1")).toBeUndefined();
  });

  test("with a graph password that can't encrypt: says to type it again", async () => {
    // Set before encryption existed: no key pair.
    await db.delete(lockKey).where(eq(lockKey.targetId, g.id));
    expect(await plan("new1", { encrypt: true })).toEqual({ encrypt: false, encryptBlocked: GRAPH_PASSWORD_CANT_ENCRYPT });
  });

  test("a republish ignores it", async () => {
    const res = await POST(extRequest("/api/ext/publications", key, { body: { ...plainBody(tree("new1")), encrypt: undefined } }));
    expect((await res.json()).encrypted).toBe(false);
    await POST(extRequest("/api/ext/publications", key, { body: plainBody(tree("new1", "changed")) }));
    expect(await row("new1")).toMatchObject({ encrypted: false, access: "open" });
  });
});
