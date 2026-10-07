import { beforeEach, describe, expect, test } from "bun:test";
import { unlock } from "@/server/actions/unlock";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { graph, passwordUnlock } from "@/db/schema";
import { hashPassword } from "@/lib/gates";
import { resetDb } from "../helpers/db";
import { makeGraph, makeUser } from "../helpers/factories";
import { request, resetRequest } from "../helpers/request";

beforeEach(async () => {
  await resetDb();
  resetRequest({ ip: "203.0.113.7" });
});

async function protectedGraph() {
  const u = await makeUser();
  const g = await makeGraph(u.id, { passwordHash: hashPassword("right-password"), indexAccess: "password" });
  request.cookies.clear(); // signing the owner up set a session cookie
  return g;
}

describe("unlock", () => {
  test("the right password unlocks and sets the cookie; a wrong one doesn't", async () => {
    const g = await protectedGraph();
    expect((await unlock({ scope: "graph", id: g.id, password: "wrong" })).ok).toBe(false);
    expect(request.cookies.size).toBe(0);
    expect((await unlock({ scope: "graph", id: g.id, password: "right-password" })).ok).toBe(true);
    // The second cookie carries the password's key, which opens encrypted pages.
    expect([...request.cookies.keys()]).toEqual([`rp_unlock_graph_${g.id}`, `rp_key_graph_${g.id}`]);
  });

  test("a password under 10 characters unlocks, but makes no key for encrypted pages", async () => {
    const u = await makeUser();
    const g = await makeGraph(u.id, { passwordHash: hashPassword("short"), indexAccess: "password" });
    request.cookies.clear();
    expect((await unlock({ scope: "graph", id: g.id, password: "short" })).ok).toBe(true);
    expect([...request.cookies.keys()]).toEqual([`rp_unlock_graph_${g.id}`]);
  });

  test("stops guessing after 10 tries from one address", async () => {
    const g = await protectedGraph();
    for (let i = 0; i < 10; i++) await unlock({ scope: "graph", id: g.id, password: `guess${i}` });
    const r = await unlock({ scope: "graph", id: g.id, password: "right-password" });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Too many");
  });

  // The first X-Forwarded-For entry is written by the client; a new fake one per try must not help.
  for (const realIp of [true, false])
  test(`a client-chosen X-Forwarded-For doesn't reset the limit (${realIp ? "with" : "without"} X-Real-IP)`, async () => {
    const g = await protectedGraph();
    if (!realIp) request.headers.delete("x-real-ip");
    for (let i = 0; i < 20; i++) {
      request.headers.set("x-forwarded-for", `10.0.0.${i}, 203.0.113.${realIp ? 7 : 8}`);
      await unlock({ scope: "graph", id: g.id, password: `guess${i}` });
    }
    const r = await unlock({ scope: "graph", id: g.id, password: "right-password" });
    expect(r.message).toContain("Too many");
  });

  test("counts successful entries per password version, not wrong ones", async () => {
    const g = await protectedGraph();
    await unlock({ scope: "graph", id: g.id, password: "wrong" });
    await unlock({ scope: "graph", id: g.id, password: "right-password" });
    await unlock({ scope: "graph", id: g.id, password: "right-password" });
    await db.update(graph).set({ passwordVersion: 1 }).where(eq(graph.id, g.id));
    await unlock({ scope: "graph", id: g.id, password: "right-password" });
    const rows = await db.select().from(passwordUnlock).where(eq(passwordUnlock.targetId, g.id));
    expect(rows.map((r) => [r.passwordVersion, r.unlocks]).sort()).toEqual([
      [0, 2],
      [1, 1],
    ]);
  });
});
