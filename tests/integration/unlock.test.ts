import { beforeEach, describe, expect, test } from "bun:test";
import { unlock } from "@/app/unlock/actions";
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
    expect([...request.cookies.keys()]).toEqual([`rp_unlock_graph_${g.id}`]);
  });

  test("stops guessing after 10 tries from one address", async () => {
    const g = await protectedGraph();
    for (let i = 0; i < 10; i++) await unlock({ scope: "graph", id: g.id, password: `guess${i}` });
    const r = await unlock({ scope: "graph", id: g.id, password: "right-password" });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("Too many");
  });

  // BUG (medium, depends on the proxy): the limit keys on the first X-Forwarded-For entry, which the
  // client writes. If Railway passes it through, a new fake address per try means no limit at all.
  test.failing("a client-chosen X-Forwarded-For doesn't reset the limit", async () => {
    const g = await protectedGraph();
    for (let i = 0; i < 20; i++) {
      request.headers.set("x-forwarded-for", `10.0.0.${i}, 203.0.113.7`);
      await unlock({ scope: "graph", id: g.id, password: `guess${i}` });
    }
    const r = await unlock({ scope: "graph", id: g.id, password: "right-password" });
    expect(r.message).toContain("Too many");
  });
});
