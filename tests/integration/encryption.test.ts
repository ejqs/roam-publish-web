import { beforeEach, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { setEncryption } from "@/server/actions/encryption";
import { updateGraphAccess } from "@/server/actions/dashboard";
import { updateCollection } from "@/server/actions/collections";
import {
  addToCollection,
  bulkUpdatePublications,
  removeEntry,
  updateGraphPlace,
} from "@/server/actions/places";
import { setPageTags } from "@/server/actions/tags";
import GraphPage from "@/app/[graph]/[uid]/[[...slug]]/page";
import CPage from "@/app/c/[id]/[[...slug]]/page";
import { GET, POST } from "@/app/api/ext/publications/route";
// Readers unlock as their browser does: a proof for passwords that take one, keeping the key.
import { unlockHere as unlock } from "@/lib/reader-unlock";
import { clearReaderKeys, loadReaderKey } from "@/lib/reader-keys";
import { openPage } from "@/lib/reader-crypto";
import { GateNotice } from "@/components/gate-notice";
import { PublicationView } from "@/components/publication-view";
import { db } from "@/db";
import { collection, collectionEntry, graph, graphDefaultCollection, lockKey, type Node, publication, publicationKey } from "@/db/schema";
import { addEntry } from "@/lib/collections";
import { contentHash } from "@/lib/content-hash";
import { hashPassword } from "@/lib/gates";
import { indexFields } from "@/lib/tags";
import { resetDb } from "../helpers/db";
import { actAs, extRequest, keyFor, makeCollection, makeGraph, makePublication, makeUser, type TestUser } from "../helpers/factories";
import { findElements, renderNested, textOf } from "../helpers/render";
import { request, resetRequest } from "../helpers/request";

const SECRET = "zanzibar";
const GRAPH_PW = "graph-password-1";
const tree = (uid: string, text = `the launch code is ${SECRET} #plans`): Node => ({
  uid,
  string: "",
  children: [{ uid: `${uid}c`, string: text, children: [] }],
});

let owner: TestUser;
let g: Awaited<ReturnType<typeof makeGraph>>;

beforeEach(async () => {
  await resetDb();
  resetRequest({ ip: "203.0.113.9" });
  owner = await makeUser();
  g = await makeGraph(owner.id, { passwordHash: hashPassword(GRAPH_PW), defaultAccess: "password" });
  actAs(owner);
});

async function passwordPage(opts: Partial<typeof publication.$inferInsert> = {}) {
  const t = tree(`p${Math.random().toString(36).slice(2, 8)}`);
  return makePublication(g.id, owner.id, {
    rootUid: t.uid,
    title: "Plans",
    tree: t,
    ...indexFields(t),
    contentHash: contentHash({ kind: "page", title: "Plans", tree: t }),
    access: "password",
    ...opts,
  });
}

/** Encrypts a page with the graph password, typing it once since the graph has no key pair yet. */
async function encrypted(opts: Partial<typeof publication.$inferInsert> = {}) {
  const pub = await passwordPage(opts);
  const res = await setEncryption(pub.id, { on: true, passwords: { [`graph:${g.id}`]: GRAPH_PW } });
  expect(res).toMatchObject({ ok: true });
  return pub;
}

const row = (id: string) => db.query.publication.findFirst({ where: eq(publication.id, id) });

async function readGraphPage(pub: { rootUid: string }) {
  return GraphPage({ params: Promise.resolve({ graph: g.name, uid: pub.rootUid }) } as never);
}

/**
 * The tree a reader sees, or the gate they get instead. An encrypted page reaches them sealed and
 * opens in their browser with the key it kept when they unlocked; `needKey` when it has none.
 */
async function readerSees(out: unknown) {
  type Gate = { blocker: Record<string, unknown>; manageHref?: string };
  type Sealed = { page: { id: string; cipher: string; sealedKey: string }; lock: { scope: "graph"; id: string; version: number } };
  const view = findElements(out as never, PublicationView)[0];
  const gate = findElements(out as never, GateNotice)[0];
  const sealed = view?.props.sealed as Sealed | undefined;
  if (sealed) {
    const key = await loadReaderKey(sealed.lock, sealed.lock.version);
    const tree = key && (await openPage(sealed.page, key))?.tree;
    return { tree: tree ?? undefined, needKey: !tree, gate: gate?.props as Gate };
  }
  return { tree: (view?.props.pub as { tree: Node } | undefined)?.tree, needKey: false, gate: gate?.props as Gate };
}

/** A fresh reader's browser: no session, no unlock cookies, no keys. */
function newReader() {
  actAs(null);
  request.cookies.clear();
  clearReaderKeys();
}

describe("turning encryption on", () => {
  test("refuses while the page is open somewhere it's shown", async () => {
    const pub = await passwordPage({ access: "open" });
    const res = await setEncryption(pub.id, { on: true });
    expect(res.ok).toBe(false);
    expect(res.message).toContain(`open in ${g.name}`);
    expect((await row(pub.id))!.encrypted).toBe(false);
  });

  test("asks once for a password set before encryption, and checks it", async () => {
    const pub = await passwordPage();
    const asked = await setEncryption(pub.id, { on: true });
    expect(asked.need).toEqual([{ lock: `graph:${g.id}`, label: g.name }]);
    const wrong = await setEncryption(pub.id, { on: true, passwords: { [`graph:${g.id}`]: "nope-nope-nope" } });
    expect(wrong.ok).toBe(false);
    expect(wrong.message).toContain("isn't the");
  });

  test("refuses a password shorter than 10 characters", async () => {
    await db.update(graph).set({ passwordHash: hashPassword("short") }).where(eq(graph.id, g.id));
    const pub = await passwordPage();
    const res = await setEncryption(pub.id, { on: true, passwords: { [`graph:${g.id}`]: "short" } });
    expect(res.ok).toBe(false);
    expect(res.message).toContain("too short");
  });

  test("stores nothing readable: no tree, search text, tags or plain hash", async () => {
    const pub = await encrypted();
    const r = (await row(pub.id))!;
    expect(r.encrypted).toBe(true);
    expect(r.encryptionVersion).toBe(1);
    expect(JSON.stringify(r)).not.toContain(SECRET);
    expect(r.tags).toEqual([]);
    expect(r.searchText).toBe("");
    expect(r.contentHash).not.toBe(pub.contentHash);
    // The extension still gets the plain hash, so it can tell nothing changed.
    const list = await (await GET(extRequest("/api/ext/publications", await keyFor(owner.id, g)))).json();
    expect(list.publications[0]).toMatchObject({ contentHash: pub.contentHash, encrypted: true });
  });

  test("tags can't be edited while encrypted", async () => {
    const pub = await encrypted();
    expect((await setPageTags(pub.id, { add: ["x"] })).ok).toBe(false);
  });
});

describe("reading an encrypted page", () => {
  test("needs the password, even for its owner, then shows the content", async () => {
    const pub = await encrypted();
    request.cookies.clear();
    const gated = await readerSees(await readGraphPage(pub));
    expect(gated.gate.blocker).toMatchObject({ need: "password", encrypted: true });
    expect(gated.gate.manageHref).toContain("/dashboard/");

    newReader();
    expect((await readerSees(await readGraphPage(pub))).gate.blocker).toMatchObject({ need: "password", encrypted: true });
    expect(await unlock({ scope: "graph", id: g.id, password: GRAPH_PW })).toMatchObject({ ok: true });
    const out = await readGraphPage(pub);
    // The server sends it sealed: nothing it renders holds the text, which opens in the browser.
    expect(textOf(out)).not.toContain(SECRET);
    expect(textOf((await readerSees(out)).tree)).toContain(SECRET);
  });

  test("a reader who unlocked before it was encrypted is asked again", async () => {
    const pub = await passwordPage();
    newReader();
    await unlock({ scope: "graph", id: g.id, password: GRAPH_PW });
    actAs(owner);
    await setEncryption(pub.id, { on: true, passwords: { [`graph:${g.id}`]: GRAPH_PW } });
    const saved = new Map(request.cookies);
    newReader();
    for (const [k, v] of saved) if (k.startsWith("rp_unlock_")) request.cookies.set(k, v);
    // Their browser has no key yet: it asks for the password again, and opens once it's typed.
    const seen = await readerSees(await readGraphPage(pub));
    expect(seen).toMatchObject({ needKey: true, tree: undefined });
    await unlock({ scope: "graph", id: g.id, password: GRAPH_PW });
    expect(textOf((await readerSees(await readGraphPage(pub))).tree)).toContain(SECRET);
  });
});

describe("changing an encrypted page", () => {
  test("can't be made open or members only", async () => {
    const pub = await encrypted();
    for (const access of ["open", "members"] as const) {
      const res = await updateGraphPlace(pub.id, { access });
      expect(res.ok).toBe(false);
      expect(res.message).toContain("Turn off encryption");
    }
    expect((await row(pub.id))!.access).toBe("password");
  });

  test("its own password needs the current one, then opens it", async () => {
    const pub = await encrypted();
    request.cookies.clear();
    const asked = await updateGraphPlace(pub.id, { password: "page-password-1" });
    expect(asked).toMatchObject({ ok: false, needCurrentPassword: true });
    expect((await row(pub.id))!.passwordHash).toBeNull();
    expect((await updateGraphPlace(pub.id, { password: "page-password-1", currentPassword: GRAPH_PW })).ok).toBe(true);
    const keys = await db.select().from(publicationKey).where(eq(publicationKey.publicationId, pub.id));
    expect(keys.map((k) => k.scope)).toEqual(["publication"]);

    newReader();
    await unlock({ scope: "publication", id: pub.id, password: "page-password-1" });
    expect(textOf((await readerSees(await readGraphPage(pub))).tree)).toContain(SECRET);
  });

  test("bulk changes keep it on Password", async () => {
    const pub = await encrypted();
    const res = await bulkUpdatePublications({ ids: [pub.id], read: "open" });
    expect(res.message).toContain("encrypted page kept Password");
    expect((await row(pub.id))!.access).toBe("password");
  });

  test("republishing keeps it encrypted, with the new content", async () => {
    const pub = await encrypted();
    const key = await keyFor(owner.id, g);
    const t = tree(pub.rootUid, "new words");
    const body = { rootUid: pub.rootUid, kind: "page", title: "Plans", tree: t, contentHash: contentHash({ kind: "page", title: "Plans", tree: t }) };
    expect((await POST(extRequest("/api/ext/publications", key, { body }))).status).toBe(200);
    const r = (await row(pub.id))!;
    expect(r.encrypted).toBe(true);
    expect(JSON.stringify(r)).not.toContain("new words");
    newReader();
    await unlock({ scope: "graph", id: g.id, password: GRAPH_PW });
    expect(textOf((await readerSees(await readGraphPage(pub))).tree)).toContain("new words");
  });

  test("turning it off needs the password and brings back search and tags", async () => {
    const pub = await encrypted();
    request.cookies.clear();
    expect(await setEncryption(pub.id, { on: false })).toMatchObject({ ok: false, needCurrentPassword: true });
    expect((await setEncryption(pub.id, { on: false, currentPassword: GRAPH_PW })).ok).toBe(true);
    const r = (await row(pub.id))!;
    expect(r.encrypted).toBe(false);
    expect(r.encryptionVersion).toBeNull();
    expect(r.searchText).toContain(SECRET);
    expect(r.tags).toEqual(["plans"]);
    expect(r.contentHash).toBe(pub.contentHash);
  });
});

describe("collections", () => {
  test("adding needs a collection password; with the page's current one it opens there right away", async () => {
    const pub = await encrypted();
    request.cookies.clear();
    const open = await makeCollection(owner.id);
    expect((await addToCollection(pub.id, open.id)).message).toContain("password first");

    const c = await makeCollection(owner.id, { passwordHash: hashPassword("collection-pw-1") });
    // The collection's password gets its key pair when someone unlocks with it.
    await unlock({ scope: "collection", id: c.id, password: "collection-pw-1" });
    request.cookies.clear();
    expect(await addToCollection(pub.id, c.id, "not-the-password")).toMatchObject({ ok: false, needCurrentPassword: true });
    expect((await addToCollection(pub.id, c.id, GRAPH_PW)).ok).toBe(true);
    expect((await row(pub.id))!.needsRepublish).toBe(false);
    const entry = (await db.query.collectionEntry.findFirst({ where: eq(collectionEntry.publicationId, pub.id) }))!;
    expect(entry.access).toBe("password");

    newReader();
    await unlock({ scope: "collection", id: c.id, password: "collection-pw-1" });
    const out = await renderNested(
      await CPage({ params: Promise.resolve({ id: c.slug, slug: [entry.entryUid, "encrypted-page"] }) } as never),
      "EntryPage",
    );
    expect(textOf((await readerSees(out)).tree)).toContain(SECRET);
  });

  test("added without a password, it waits for a republish from Roam, which opens it there", async () => {
    const pub = await encrypted();
    request.cookies.clear();
    const c = await makeCollection(owner.id, { passwordHash: hashPassword("collection-pw-1") });
    await unlock({ scope: "collection", id: c.id, password: "collection-pw-1" });
    request.cookies.clear();
    const res = await addToCollection(pub.id, c.id);
    expect(res).toMatchObject({ ok: true });
    expect(res.message).toContain("once you republish it from Roam");
    expect((await row(pub.id))!.needsRepublish).toBe(true);
    const entry = (await db.query.collectionEntry.findFirst({ where: eq(collectionEntry.publicationId, pub.id) }))!;
    expect(entry.access).toBe("password");
    const read = async () => {
      newReader();
      await unlock({ scope: "collection", id: c.id, password: "collection-pw-1" });
      return readerSees(
        await renderNested(await CPage({ params: Promise.resolve({ id: c.slug, slug: [entry.entryUid, "encrypted-page"] }) } as never), "EntryPage"),
      );
    };
    expect((await read()).gate.blocker).toEqual({ need: "republish" });
    // Still opens in the graph meanwhile.
    newReader();
    await unlock({ scope: "graph", id: g.id, password: GRAPH_PW });
    expect(textOf((await readerSees(await readGraphPage(pub))).tree)).toContain(SECRET);

    // Republishing the same text from Roam seals it to the collection's password too.
    actAs(owner);
    const key = await keyFor(owner.id, g);
    const t = tree(pub.rootUid);
    const body = { rootUid: pub.rootUid, kind: "page", title: "Plans", tree: t, contentHash: contentHash({ kind: "page", title: "Plans", tree: t }) };
    expect((await (await POST(extRequest("/api/ext/publications", key, { body }))).json()).status).toBe("updated");
    expect((await row(pub.id))!.needsRepublish).toBe(false);
    expect(textOf((await read()).tree)).toContain(SECRET);
  });

  test("leaving its last collection is refused when the graph has no password", async () => {
    const pub = await encrypted();
    const c = await makeCollection(owner.id, { passwordHash: hashPassword("collection-pw-1"), defaultAccess: "password" });
    await unlock({ scope: "collection", id: c.id, password: "collection-pw-1" });
    expect((await addToCollection(pub.id, c.id, GRAPH_PW)).ok).toBe(true);
    await updateGraphPlace(pub.id, { inGraph: false });
    // Taking the graph's password away is refused while pages use it, so fake a graph without one.
    await db.update(graph).set({ passwordHash: null }).where(eq(graph.id, g.id));
    const entry = (await db.query.collectionEntry.findFirst({ where: eq(collectionEntry.publicationId, pub.id) }))!;
    const res = await removeEntry(entry.id);
    expect(res.ok).toBe(false);
    expect(res.message).toContain("Unpublish it, or turn off encryption");
    expect(await db.query.collectionEntry.findFirst({ where: eq(collectionEntry.id, entry.id) })).toBeDefined();
  });

  test("an entry added without the page's key can't be read: it's refused instead", async () => {
    const pub = await encrypted();
    const c = await makeCollection(owner.id, { passwordHash: hashPassword("collection-pw-1"), defaultAccess: "password" });
    await addEntry(c.id, pub.id, owner.id);
    const entry = (await db.query.collectionEntry.findFirst({ where: eq(collectionEntry.publicationId, pub.id) }))!;
    newReader();
    await unlock({ scope: "collection", id: c.id, password: "collection-pw-1" });
    const out = await renderNested(
      await CPage({ params: Promise.resolve({ id: c.slug, slug: [entry.entryUid, "encrypted-page"] }) } as never),
      "EntryPage",
    );
    expect((await readerSees(out)).gate.blocker).toEqual({ need: "republish" });
  });
});

describe("the graph password", () => {
  const settings = (password: string, extra: Record<string, unknown> = {}) =>
    updateGraphAccess(g.id, {
      indexAccess: "open",
      defaultAccess: "password",
      encryptNewPages: false,
      password,
      clearPassword: false,
      ...extra,
    });

  test("changing it needs the current one, and the page opens with the new one", async () => {
    const pub = await encrypted();
    request.cookies.clear();
    expect(await settings("brand-new-password")).toMatchObject({ ok: false, needCurrentPassword: true });
    expect((await settings("short1"))?.message).toContain("at least 10");
    expect((await settings("brand-new-password", { currentPassword: GRAPH_PW }))?.ok).toBe(true);
    newReader();
    await unlock({ scope: "graph", id: g.id, password: "brand-new-password" });
    expect(textOf((await readerSees(await readGraphPage(pub))).tree)).toContain(SECRET);
  });

  test("resetting it leaves the page needing a republish, which fixes it", async () => {
    const pub = await encrypted();
    request.cookies.clear();
    expect((await settings("brand-new-password", { resetEncrypted: true }))?.ok).toBe(true);
    expect((await row(pub.id))!.needsRepublish).toBe(true);
    newReader();
    await unlock({ scope: "graph", id: g.id, password: "brand-new-password" });
    expect((await readerSees(await readGraphPage(pub))).gate.blocker).toEqual({ need: "republish" });

    const t = tree(pub.rootUid);
    const body = { rootUid: pub.rootUid, kind: "page", title: "Plans", tree: t, contentHash: contentHash({ kind: "page", title: "Plans", tree: t }) };
    // Same content as before: still republished, since its keys need sealing again.
    const res = await (await POST(extRequest("/api/ext/publications", await keyFor(owner.id, g), { body }))).json();
    expect(res.status).toBe("updated");
    expect((await row(pub.id))!.needsRepublish).toBe(false);
    expect(textOf((await readerSees(await readGraphPage(pub))).tree)).toContain(SECRET);
  });

  test("a password long enough gets a key pair when set; a short one doesn't", async () => {
    await settings("another-long-one");
    expect(await db.query.lockKey.findFirst({ where: and(eq(lockKey.scope, "graph"), eq(lockKey.targetId, g.id)) })).toBeDefined();
    await settings("short1");
    expect(await db.query.lockKey.findFirst({ where: and(eq(lockKey.scope, "graph"), eq(lockKey.targetId, g.id)) })).toBeUndefined();
  });
});

describe("Encrypt new password pages", () => {
  const LONG_PW = "another-long-one";
  const access = (password: string, extra: Record<string, unknown> = {}) =>
    updateGraphAccess(g.id, {
      indexAccess: "open",
      defaultAccess: "password",
      encryptNewPages: true,
      password,
      clearPassword: false,
      ...extra,
    });

  async function publishNew() {
    const t = tree(`n${Math.random().toString(36).slice(2, 8)}`);
    const body = { rootUid: t.uid, kind: "page", title: "Plans", tree: t, contentHash: contentHash({ kind: "page", title: "Plans", tree: t }) };
    const res = await (await POST(extRequest("/api/ext/publications", await keyFor(owner.id, g), { body }))).json();
    expect(res.status).toBe("created");
    return (await db.query.publication.findFirst({ where: and(eq(publication.graphId, g.id), eq(publication.rootUid, t.uid)) }))!;
  }

  test("can't be turned on with a password that can't encrypt", async () => {
    // The graph password predates encryption: no key pair until it's typed again.
    expect((await access(""))?.message).toContain("at least 10");
    expect((await access("short1"))?.ok).toBe(false);
    expect((await db.query.graph.findFirst({ where: eq(graph.id, g.id) }))!.encryptNewPages).toBe(false);
    // Typing it again makes the key pair.
    expect((await access(GRAPH_PW))?.ok).toBe(true);
    expect((await db.query.graph.findFirst({ where: eq(graph.id, g.id) }))!.encryptNewPages).toBe(true);
  });

  test("is only kept while new pages start as Password", async () => {
    expect((await access("", { defaultAccess: "open" }))?.ok).toBe(true);
    expect((await db.query.graph.findFirst({ where: eq(graph.id, g.id) }))!.encryptNewPages).toBe(false);
  });

  test("new pages are stored encrypted and open with the password", async () => {
    expect((await access(LONG_PW))?.ok).toBe(true);
    const pub = await publishNew();
    expect(pub).toMatchObject({ encrypted: true, searchText: "", tags: [], needsRepublish: false });
    expect(JSON.stringify(pub.tree)).not.toContain(SECRET);
    newReader();
    await unlock({ scope: "graph", id: g.id, password: LONG_PW });
    expect(textOf((await readerSees(await readGraphPage(pub))).tree)).toContain(SECRET);
  });

  test("off, new pages stay readable", async () => {
    expect((await access(LONG_PW, { encryptNewPages: false }))?.ok).toBe(true);
    expect((await publishNew()).encrypted).toBe(false);
  });

  test("a page also shown somewhere open isn't encrypted", async () => {
    expect((await access(LONG_PW))?.ok).toBe(true);
    const c = await makeCollection(owner.id, { defaultAccess: "open" });
    await db.insert(graphDefaultCollection).values({ graphId: g.id, collectionId: c.id });
    expect((await publishNew()).encrypted).toBe(false);
  });

  test("a collection's setting encrypts pages added to it", async () => {
    const c = await makeCollection(owner.id);
    const save = (extra: Record<string, unknown>) =>
      updateCollection(c.id, {
        name: c.name,
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
        password: "",
        clearPassword: false,
        ...extra,
      });
    expect((await save({ password: "short1" })).ok).toBe(false);
    expect(await save({ password: LONG_PW })).toMatchObject({ ok: true });
    expect((await db.query.collection.findFirst({ where: eq(collection.id, c.id) }))!.encryptNewPages).toBe(true);
    // Pages go only to the collection, so it's their one place.
    await db.update(graph).set({ newPagesInGraph: false, defaultAccess: "open" }).where(eq(graph.id, g.id));
    await db.insert(graphDefaultCollection).values({ graphId: g.id, collectionId: c.id });
    expect((await publishNew()).encrypted).toBe(true);
  });
});
