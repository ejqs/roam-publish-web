import { beforeEach, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { updateGraphAccess } from "@/server/actions/dashboard";
import GraphPage from "@/app/[graph]/[uid]/[[...slug]]/page";
import { GET, POST } from "@/app/api/ext/publications/route";
import { GET as SEAL } from "@/app/api/ext/publications/[rootUid]/seal/route";
import { unlockHere as unlock } from "@/lib/reader-unlock";
import { clearReaderKeys, loadReaderKey } from "@/lib/reader-keys";
import { openPage } from "@/lib/reader-crypto";
import { encryptTree, sealContentKey } from "@/lib/encryption";
import type { SealPlan } from "@/lib/e2e-publish";
import { PublicationView } from "@/components/publication-view";
import { db } from "@/db";
import { graph, type Node, publication, publicationKey } from "@/db/schema";
import { hashPassword } from "@/lib/gates";
import { resetDb } from "../helpers/db";
import { actAs, extRequest, keyFor, makeGraph, makeUser, type TestUser } from "../helpers/factories";
import { findElements, textOf } from "../helpers/render";
import { request, resetRequest } from "../helpers/request";

/**
 * Publishing a page encrypted in Roam (extension 1.0.0 and later): roam.pub gets a cipher and sealed
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

const plan = async (rootUid: string) =>
  (await (await SEAL(extRequest(`/api/ext/publications/${rootUid}/seal`, key), { params: Promise.resolve({ rootUid }) } as never)).json()) as SealPlan;

/** What extension 1.0.0 does: asks for the plan, encrypts the tree and seals its key in Roam. */
async function publishSealed(t: Node, hash: string, p?: SealPlan) {
  p ??= await plan(t.uid);
  if (!p.encrypt) throw new Error("not encrypted");
  const ck = randomBytes(32);
  const body = {
    rootUid: t.uid,
    kind: "page",
    title: "Plans",
    folded: [`${t.uid}c`],
    contentHash: hash,
    sealed: {
      publicationId: p.publicationId,
      cipher: encryptTree(ck, t, p.publicationId),
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
  return k && openPage(sealed.page, k);
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
});

describe("publishing encrypted in Roam", () => {
  test("roam.pub stores only the cipher, and the reader's browser opens it", async () => {
    const t = tree("pg1");
    const res = await publishSealed(t, keyed(1));
    expect(res.body).toMatchObject({ status: "created", encrypted: true, contentHash: keyed(1) });
    const r = (await row("pg1"))!;
    expect(r).toMatchObject({ encrypted: true, searchText: "", tags: [], needsRepublish: false, folded: ["pg1c"], contentHash: keyed(1) });
    expect(JSON.stringify(r)).not.toContain(SECRET);
    expect(await db.select().from(publicationKey).where(eq(publicationKey.publicationId, r.id))).toHaveLength(1);
    expect(textOf((await readerSees("pg1"))!)).toContain(SECRET);
  });

  test("republishing: the same keyed hash is unchanged, a new one replaces the content", async () => {
    await publishSealed(tree("pg1"), keyed(1));
    expect((await publishSealed(tree("pg1"), keyed(1))).body.status).toBe("unchanged");
    expect((await publishSealed(tree("pg1", "now it's 42"), keyed(2))).body.status).toBe("updated");
    expect(textOf((await readerSees("pg1"))!)).toContain("now it's 42");
    // The extension compares the keyed hash it sent.
    const list = await (await GET(extRequest("/api/ext/publications", key))).json();
    expect(list.publications[0]).toMatchObject({ contentHash: keyed(2), encrypted: true });
  });

  test("older extensions can still republish it in plain; roam.pub encrypts it then", async () => {
    await publishSealed(tree("pg1"), keyed(1));
    const t = tree("pg1", "plain again");
    const { contentHash } = await import("@/lib/content-hash");
    const body = { rootUid: "pg1", kind: "page", title: "Plans", tree: t, contentHash: contentHash({ kind: "page", title: "Plans", tree: t }) };
    expect((await (await POST(extRequest("/api/ext/publications", key, { body }))).json()).status).toBe("updated");
    expect(textOf((await readerSees("pg1"))!)).toContain("plain again");
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
