import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { DELETE, PATCH } from "@/app/api/ext/publications/[rootUid]/route";
import { GET, OPTIONS, POST } from "@/app/api/ext/publications/route";
import { db } from "@/db";
import { graph, publication, user } from "@/db/schema";
import { resetDb } from "../helpers/db";
import { addGraphMember, extRequest, keyFor, makeGraph, makeUser, payload } from "../helpers/factories";
import { resetRequest } from "../helpers/request";
import { revokeKeys } from "@/lib/keys";

const publish = (key: string | null, body: unknown) => POST(extRequest("/api/ext/publications", key, { body }));
const byUid = (method: "DELETE" | "PATCH", key: string, rootUid: string, body?: unknown) => {
  const req = extRequest(`/api/ext/publications/${rootUid}`, key, { method, body });
  const ctx = { params: Promise.resolve({ rootUid }) } as never;
  return method === "DELETE" ? DELETE(req, ctx) : PATCH(req, ctx);
};

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

describe("API key", () => {
  test("missing or wrong key is 401", async () => {
    expect((await publish(null, payload())).status).toBe(401);
    expect((await publish("rp_nope", payload())).status).toBe(401);
    expect((await GET(extRequest("/api/ext/publications", "rp_nope"))).status).toBe(401);
  });

  test("a revoked key stops working", async () => {
    await revokeKeys(owner.id, g.id);
    expect((await publish(ownerKey, payload())).status).toBe(401);
  });

  test("a removed member's key stops working, even before it is revoked", async () => {
    const m = await makeUser();
    await addGraphMember(g.id, m.id);
    const key = await keyFor(m.id, g);
    expect((await publish(key, payload())).status).toBe(200);
    await db.execute(`delete from graph_member where user_id = '${m.id}'` as never);
    expect((await publish(key, payload())).status).toBe(401);
  });

  test("a banned owner's graph rejects every key", async () => {
    const m = await makeUser();
    await addGraphMember(g.id, m.id);
    const key = await keyFor(m.id, g);
    await db.update(user).set({ banned: true }).where(eq(user.id, owner.id));
    expect((await publish(key, payload())).status).toBe(401);
  });

  test("a suspended graph is 403 with the reason", async () => {
    await db.update(graph).set({ suspendedAt: new Date(), suspendedReason: "spam" }).where(eq(graph.id, g.id));
    const res = await publish(ownerKey, payload());
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe("spam");
  });

  test("a key only reaches its own graph", async () => {
    const other = await makeUser();
    const g2 = await makeGraph(other.id);
    await keyFor(other.id, g2);
    const p = payload();
    await publish(ownerKey, p);
    const list = await (await GET(extRequest("/api/ext/publications", ownerKey))).json();
    expect(list.publications.map((x: { rootUid: string }) => x.rootUid)).toEqual([p.rootUid]);
    const [row] = await db.select().from(publication);
    expect(row.graphId).toBe(g.id);
  });
});

describe("publish", () => {
  test("creates unlisted, then unchanged, then updated", async () => {
    const p = payload();
    const a = await (await publish(ownerKey, p)).json();
    expect(a.status).toBe("created");
    expect(a.visibility).toBe("unlisted");
    expect(a.url).toContain(`/${g.name}/`);
    const b = await (await publish(ownerKey, p)).json();
    expect(b.status).toBe("unchanged");
    const p2 = payload({ rootUid: p.rootUid, text: "edited" });
    const c = await (await publish(ownerKey, p2)).json();
    expect(c.status).toBe("updated");
  });

  test("republishing keeps visibility", async () => {
    const p = payload();
    await publish(ownerKey, p);
    await byUid("PATCH", ownerKey, p.rootUid, { visibility: "public" });
    const r = await (await publish(ownerKey, payload({ rootUid: p.rootUid, text: "v2" }))).json();
    expect(r.visibility).toBe("public");
  });

  test("rejects a hash that doesn't match the content", async () => {
    const p = { ...payload(), contentHash: "0".repeat(64) };
    expect((await publish(ownerKey, p)).status).toBe(400);
  });

  test("rejects invalid JSON and invalid payloads", async () => {
    expect((await publish(ownerKey, "{")).status).toBe(400);
    expect((await publish(ownerKey, { rootUid: "x" })).status).toBe(400);
  });

  test("counts the 1 MB limit in bytes, not characters", async () => {
    const p = payload({ text: "é".repeat(99_000) });
    const big = { ...p, pad: "é".repeat(600_000) }; // 600k characters, 1.2 MB
    expect((await publish(ownerKey, big)).status).toBe(413);
  });

  test("a block with several embeds keeps all of them", async () => {
    const e = (uid: string) => ({ uid, string: uid, children: [] });
    const tree = {
      uid: "root",
      string: "",
      children: [{ uid: "b", string: "{{embed: ((e1))}} {{embed: ((e2))}}", embed: e("e1"), moreEmbeds: [e("e2")], children: [] }],
    };
    const p = payload({ rootUid: "root", tree });
    expect((await publish(ownerKey, p)).status).toBe(200);
    const [row] = await db.select().from(publication).where(eq(publication.rootUid, "root"));
    expect(row.tree.children[0].moreEmbeds?.map((n) => n.uid)).toEqual(["e2"]);
  });

  test("an ordinary nested outline still publishes", async () => {
    let tree = { uid: "leaf", string: "x", children: [] as unknown[] };
    for (let i = 0; i < 50; i++) tree = { uid: `n${i}`, string: "", children: [tree] };
    expect((await publish(ownerKey, payload({ tree: tree as never }))).status).toBe(200);
  });

  test("rejects payloads over 1 MB", async () => {
    const p = payload({ text: "x".repeat(99_000) });
    const big = { ...p, pad: "y".repeat(1_000_001) };
    expect((await publish(ownerKey, big)).status).toBe(413);
  });

  test("a deeply nested tree is rejected, not a server error", async () => {
    const depth = 20_000;
    const tree = '{"uid":"n","string":"","children":['.repeat(depth) + '{"uid":"leaf","string":"x","children":[]}' + "]}".repeat(depth);
    const body = `{"rootUid":"deep","kind":"page","title":"Deep","contentHash":"${"0".repeat(64)}","tree":${tree}}`;
    const res = await publish(ownerKey, body);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test("the author byline is outside the hash", async () => {
    const p = payload();
    await publish(ownerKey, { ...p, author: "Ann" });
    const r = await (await publish(ownerKey, { ...p, author: "Bea" })).json();
    expect(r.status).toBe("updated");
    const [row] = await db.select().from(publication);
    expect(row.authorName).toBe("Bea");
    // Older extensions don't send one: the stored byline stays.
    expect((await (await publish(ownerKey, p)).json()).status).toBe("unchanged");
  });
});

describe("members and ownership", () => {
  test("a member can't change or delete the owner's page; the owner can change a member's", async () => {
    const m = await makeUser();
    await addGraphMember(g.id, m.id);
    const mKey = await keyFor(m.id, g);
    const ownerPage = payload();
    await publish(ownerKey, ownerPage);
    expect((await publish(mKey, payload({ rootUid: ownerPage.rootUid, text: "hijack" }))).status).toBe(403);
    expect((await byUid("DELETE", mKey, ownerPage.rootUid)).status).toBe(403);
    expect((await byUid("PATCH", mKey, ownerPage.rootUid, { visibility: "public" })).status).toBe(403);

    const memberPage = payload();
    await publish(mKey, memberPage);
    expect((await byUid("PATCH", ownerKey, memberPage.rootUid, { visibility: "public" })).status).toBe(200);
    expect((await byUid("DELETE", ownerKey, memberPage.rootUid)).status).toBe(200);
  });

  test("a member's anchorUid can't be moved by another member's publish of the same page", async () => {
    const m = await makeUser();
    await addGraphMember(g.id, m.id);
    const mKey = await keyFor(m.id, g);
    const p = payload();
    await publish(ownerKey, { ...p, anchorUid: "ownerAnchor1" });
    await publish(mKey, { ...payload({ rootUid: p.rootUid, text: "x" }), anchorUid: "evilAnchor01" });
    const list = await (await GET(extRequest("/api/ext/publications", ownerKey))).json();
    expect(list.publications[0].anchorUid).toBe("ownerAnchor1");
  });
});

describe("moderation", () => {
  test("a removed page can't be republished, unlisted or deleted", async () => {
    const p = payload();
    await publish(ownerKey, p);
    await db.update(publication).set({ removedAt: new Date(), removedReason: "abuse" });
    expect((await publish(ownerKey, payload({ rootUid: p.rootUid, text: "new" }))).status).toBe(403);
    expect((await byUid("DELETE", ownerKey, p.rootUid)).status).toBe(403);
    expect((await byUid("PATCH", ownerKey, p.rootUid, { visibility: "unlisted" })).status).toBe(403);
    expect(await db.select().from(publication)).toHaveLength(1);
  });
});

describe("CORS", () => {
  test("allows Roam only", async () => {
    const ok = await OPTIONS(new Request("http://x/api/ext/publications", { method: "OPTIONS", headers: { origin: "https://roamresearch.com" } }));
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://roamresearch.com");
    const bad = await OPTIONS(new Request("http://x/api/ext/publications", { method: "OPTIONS", headers: { origin: "https://evil.example" } }));
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });
});
