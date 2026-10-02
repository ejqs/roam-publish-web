import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  collection,
  collectionMember,
  cPath,
  graph,
  graphMember,
  type Node,
  publication,
  user,
} from "@/db/schema";
import { auth } from "@/lib/auth";
import { contentHash } from "@/lib/content-hash";
import { issueKey } from "@/lib/keys";
import { request } from "./request";

let n = 0;
const next = () => `${Date.now().toString(36)}${n++}`;

export type TestUser = { id: string; email: string; cookie: string };

/** A signed-up user with a verified email and a live session cookie. */
export async function makeUser(opts: { verified?: boolean; email?: string } = {}): Promise<TestUser> {
  const email = opts.email ?? `u${next()}@example.com`;
  const password = "correct horse battery";
  const { user: u } = await auth.api.signUpEmail({ body: { email, password, name: email.split("@")[0] } });
  await db.update(user).set({ emailVerified: true }).where(eq(user.id, u.id));
  const res = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  if (opts.verified === false) await db.update(user).set({ emailVerified: false }).where(eq(user.id, u.id));
  return { id: u.id, email, cookie };
}

/** Makes the next server action or page run as this user (or signed out, with null). */
export function actAs(u: TestUser | null) {
  if (u) request.headers.set("cookie", u.cookie);
  else request.headers.delete("cookie");
}

export async function makeGraph(ownerId: string, opts: Partial<typeof graph.$inferInsert> = {}) {
  const [g] = await db
    .insert(graph)
    .values({ userId: ownerId, name: `g${next()}`, ...opts })
    .returning();
  return g;
}

export async function addGraphMember(graphId: string, userId: string) {
  await db.insert(graphMember).values({ graphId, userId });
}

export async function keyFor(userId: string, g: { id: string; name: string }) {
  return issueKey(userId, g.id, g.name);
}

export async function makeCollection(ownerId: string, opts: Partial<typeof collection.$inferInsert> = {}) {
  const slug = opts.slug ?? `c${next()}`;
  await db.insert(cPath).values({ path: slug, kind: "collection" });
  const [c] = await db
    .insert(collection)
    .values({ ownerId, name: `Collection ${slug}`, ...opts, slug })
    .returning();
  return c;
}

export async function addCollectionMember(collectionId: string, userId: string) {
  await db.insert(collectionMember).values({ collectionId, userId });
}

/** A one-block page tree and its payload, hashed like the extension does. */
export function payload(opts: { rootUid?: string; title?: string; text?: string; tree?: Node; kind?: "page" | "block" } = {}) {
  const rootUid = opts.rootUid ?? `r${next()}`.slice(0, 20);
  const kind = opts.kind ?? "page";
  const title = opts.title ?? "Hello";
  const tree: Node = opts.tree ?? {
    uid: rootUid,
    string: "",
    children: [{ uid: `${rootUid}c`, string: opts.text ?? "Some text", children: [] }],
  };
  return { rootUid, kind, title, tree, contentHash: contentHash({ kind, title, tree }) };
}

/** A Request as the extension sends it. */
export function extRequest(path: string, key: string | null, init: { method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { origin: "https://roamresearch.com", "content-type": "application/json" };
  if (key) headers["x-api-key"] = key;
  return new Request(`http://localhost:3000${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers,
    body: init.body === undefined ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body),
  });
}

/** A publication row inserted directly, for read-side tests. */
export async function makePublication(graphId: string, publishedBy: string, opts: Partial<typeof publication.$inferInsert> = {}) {
  const p = payload({ title: opts.title ?? "Page", text: "body text" });
  const [row] = await db
    .insert(publication)
    .values({
      graphId,
      publishedBy,
      rootUid: p.rootUid,
      kind: "page",
      title: p.title,
      tree: p.tree,
      contentHash: p.contentHash,
      ...opts,
    })
    .returning();
  return row;
}
