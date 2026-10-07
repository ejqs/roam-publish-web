import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { POST as publish } from "@/app/api/ext/publications/route";
import { db } from "@/db";
import { apikey, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { resetDb } from "../helpers/db";
import { actAs, extRequest, makeGraph, makeUser, payload, type TestUser } from "../helpers/factories";
import { generateKey } from "@/server/actions/keys";
import { resetRequest } from "../helpers/request";

/** Calls a better-auth endpoint over HTTP, as a browser would. */
const call = (path: string, u: TestUser | null, body?: unknown) =>
  auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", ...(u && { cookie: u.cookie }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );

beforeEach(async () => {
  await resetDb();
  resetRequest();
});

describe("better-auth endpoints a signed-in user can reach", () => {
  test("can't make themselves an admin or unban themselves", async () => {
    const u = await makeUser();
    await call("/update-user", u, { role: "admin", banned: false, name: "x" });
    const row = await db.query.user.findFirst({ where: eq(user.id, u.id) });
    expect(row?.role).not.toBe("admin");
  });

  test("admin plugin endpoints refuse non-admins", async () => {
    const u = await makeUser();
    const victim = await makeUser();
    expect((await call("/admin/set-role", u, { userId: u.id, role: "admin" })).status).toBeGreaterThanOrEqual(400);
    expect((await call("/admin/ban-user", u, { userId: victim.id })).status).toBeGreaterThanOrEqual(400);
    expect((await call("/admin/list-users", u)).status).toBeGreaterThanOrEqual(400);
    expect((await call("/admin/impersonate-user", u, { userId: victim.id })).status).toBeGreaterThanOrEqual(400);
  });

  test("a key minted through better-auth for someone else's graph is useless", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    const attacker = await makeUser();
    const res = await call("/api-key/create", attacker, { name: "x", metadata: { graphId: g.id } });
    if (res.ok) {
      const { key } = await res.json();
      expect((await publish(extRequest("/api/ext/publications", key, { body: payload() }))).status).toBe(401);
    }
  });

  test("keys can't be minted outside the dashboard (one key per person per graph)", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    await call("/api-key/create", owner, { name: "x", metadata: { graphId: g.id } });
    await call("/api-key/create", owner, { name: "y", metadata: { graphId: g.id } });
    expect((await db.select().from(apikey)).length).toBeLessThanOrEqual(1);
  });

  test("the dashboard still issues a working key, and only one per graph", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    actAs(owner);
    const first = await generateKey(g.id);
    const second = await generateKey(g.id);
    expect(first.ok && second.ok).toBe(true);
    const key = (second as { key: string }).key;
    expect((await publish(extRequest("/api/ext/publications", key, { body: payload() }))).status).toBe(200);
    expect(await db.select().from(apikey)).toHaveLength(1);
  });

  test("can't create a key that skips the rate limit", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    const res = await call("/api-key/create", owner, { name: "x", metadata: { graphId: g.id }, rateLimitEnabled: false });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
