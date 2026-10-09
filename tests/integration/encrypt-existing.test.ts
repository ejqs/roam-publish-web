import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { decryptExistingPages, encryptExistingPages } from "@/server/actions/encryption";
import { db } from "@/db";
import { lockKey, type Node, publication } from "@/db/schema";
import { addEntry } from "@/lib/collections";
import { contentHash } from "@/lib/content-hash";
import { contentKeyFor, decryptTree, newLockKey } from "@/lib/encryption";
import { hashPassword } from "@/lib/gates";
import { indexFields } from "@/lib/tags";
import { resetDb } from "../helpers/db";
import { actAs, makeCollection, makeGraph, makePublication, makeUser, type TestUser } from "../helpers/factories";
import { resetRequest } from "../helpers/request";

const GRAPH_PW = "graph-password-1";
const COLLECTION_PW = "collection-pw-1";

let owner: TestUser;
let g: Awaited<ReturnType<typeof makeGraph>>;
let c: Awaited<ReturnType<typeof makeCollection>>;

async function withKey(scope: "graph" | "collection", id: string, password: string) {
  await db.insert(lockKey).values({ scope, targetId: id, ...newLockKey(password) });
}

async function page(graphId: string, by: string, title: string, access: "password" | "open" | "inherit" = "password") {
  const uid = `p${Math.random().toString(36).slice(2, 8)}`;
  const tree: Node = { uid, string: "", children: [{ uid: `${uid}c`, string: `secret of ${title}`, children: [] }] };
  return makePublication(graphId, by, {
    rootUid: uid,
    title,
    tree,
    ...indexFields(tree),
    contentHash: contentHash({ kind: "page", title, tree }),
    access,
  });
}

const row = (id: string) => db.query.publication.findFirst({ where: eq(publication.id, id) });

beforeEach(async () => {
  await resetDb();
  resetRequest({ ip: "203.0.113.9" });
  owner = await makeUser();
  g = await makeGraph(owner.id, { passwordHash: hashPassword(GRAPH_PW), defaultAccess: "password" });
  await withKey("graph", g.id, GRAPH_PW);
  c = await makeCollection(owner.id, { passwordHash: hashPassword(COLLECTION_PW), defaultAccess: "password" });
  await withKey("collection", c.id, COLLECTION_PW);
  actAs(owner);
});

describe("encryptExistingPages", () => {
  test("previews, then encrypts the collection's pages that are password-protected everywhere", async () => {
    const ready = await page(g.id, owner.id, "Ready");
    const openInGraph = await page(g.id, owner.id, "Open in graph", "open");
    const other = await makeUser();
    const theirs = await page((await makeGraph(other.id)).id, other.id, "Theirs");
    for (const p of [ready, openInGraph, theirs]) await addEntry(c.id, p.id, owner.id);

    const preview = await encryptExistingPages("collection", c.id, { preview: true });
    expect(preview.pages).toEqual(["Ready"]);
    expect(preview.skipped).toEqual([
      { title: "Open in graph", reason: `Open in ${g.name}`, manageHref: `/${g.name}/${openInGraph.rootUid}/open-in-graph?manage` },
      { title: "Theirs", reason: "Published by another member" },
    ]);
    expect((await row(ready.id))!.encrypted).toBe(false);

    const res = await encryptExistingPages("collection", c.id);
    expect(res).toMatchObject({ ok: true, message: "Encrypted 1 page. 2 left as they were.", pages: ["Ready"] });
    const after = (await row(ready.id))!;
    expect(after.encrypted).toBe(true);
    expect(JSON.stringify(after.tree)).not.toContain("secret");
    // Both its passwords open it: the collection's and the graph's.
    for (const pw of [COLLECTION_PW, GRAPH_PW]) {
      const ck = await contentKeyFor(db, after, { passwords: [pw] });
      expect(JSON.stringify(decryptTree(ck!, after.cipher!, after.id))).toContain("secret of Ready");
    }
    expect((await row(openInGraph.id))!.encrypted).toBe(false);
    expect((await row(theirs.id))!.encrypted).toBe(false);
  });

  test("a graph's pages, skipping one whose password can't encrypt yet", async () => {
    const ready = await page(g.id, owner.id, "Ready", "inherit");
    const old = await makeCollection(owner.id, { passwordHash: hashPassword("short"), defaultAccess: "password" });
    const inOld = await page(g.id, owner.id, "In old collection");
    await addEntry(old.id, inOld.id, owner.id);

    const res = await encryptExistingPages("graph", g.id);
    expect(res.pages).toEqual(["Ready"]);
    expect(res.skipped).toEqual([
      {
        title: "In old collection",
        reason: `The password in ${old.name} was set before encryption existed or is too short`,
        manageHref: expect.stringMatching(new RegExp(`^/c/${old.slug}/[^/]+/in-old-collection\\?manage$`)),
      },
    ]);
    expect((await row(ready.id))!.encrypted).toBe(true);
  });

  test("waits for a password with a key pair, and is only for the owner", async () => {
    const plain = await makeCollection(owner.id, { passwordHash: hashPassword(COLLECTION_PW), defaultAccess: "password" });
    expect(await encryptExistingPages("collection", plain.id)).toMatchObject({ ok: false, message: expect.stringMatching(/Needs a saved collection password/) });

    actAs(await makeUser());
    expect(await encryptExistingPages("collection", c.id)).toMatchObject({ ok: false, message: expect.stringMatching(/Only the collection.s owner/) });
  });
});

describe("decryptExistingPages", () => {
  test("decrypts the pages one password opens and leaves the rest encrypted", async () => {
    const shared = await page(g.id, owner.id, "Shared");
    const own = await page(g.id, owner.id, "Own password", "password");
    await db.update(publication).set({ passwordHash: hashPassword("its-own-pw-1") }).where(eq(publication.id, own.id));
    await db.insert(lockKey).values({ scope: "publication", targetId: own.id, ...newLockKey("its-own-pw-1") });
    expect((await encryptExistingPages("graph", g.id)).pages).toEqual(["Own password", "Shared"]);
    // Their titles are encrypted with them.
    expect(await row(shared.id)).toMatchObject({ title: "Encrypted page", titleCipher: expect.stringMatching(/^v1\./) });

    const preview = await decryptExistingPages("graph", g.id, GRAPH_PW, { preview: true });
    // A page this password doesn't open keeps its title encrypted, so it's listed without one.
    expect(preview).toMatchObject({ ok: true, pages: ["Shared"], skipped: [{ title: "Encrypted page", reason: "Encrypted with a different password" }] });
    expect((await row(shared.id))!.encrypted).toBe(true);

    expect(await decryptExistingPages("graph", g.id, "wrong-password")).toMatchObject({ ok: false, pages: [] });
    const res = await decryptExistingPages("graph", g.id, GRAPH_PW);
    expect(res).toMatchObject({ ok: true, message: "Decrypted 1 page. 1 still encrypted." });
    const after = (await row(shared.id))!;
    // Its title comes back with it.
    expect(after).toMatchObject({ encrypted: false, cipher: null, titleCipher: null, title: "Shared" });
    expect(JSON.stringify(after.tree)).toContain("secret of Shared");
    expect((await row(own.id))!.encrypted).toBe(true);
  });

  test("needs the password, and is only for the owner", async () => {
    expect(await decryptExistingPages("graph", g.id, "")).toMatchObject({ ok: false, message: expect.stringMatching(/Enter the password/) });
    actAs(await makeUser());
    expect(await decryptExistingPages("graph", g.id, GRAPH_PW)).toMatchObject({ ok: false, message: expect.stringMatching(/Only the graph's owner/) });
  });
});
