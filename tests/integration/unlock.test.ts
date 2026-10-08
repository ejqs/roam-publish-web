import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { graph, lockKey, passwordUnlock } from "@/db/schema";
import { newLockKey } from "@/lib/encryption";
import { hashPassword } from "@/lib/gates";
import { passwordKey, unlockProof, unwrapPrivateKey } from "@/lib/reader-crypto";
import { unlock, unlockSalt, unlockWithProof } from "@/server/actions/unlock";
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
    // Only the unlock: the password's key stays in the reader's browser, never in a cookie.
    expect([...request.cookies.keys()]).toEqual([`rp_unlock_graph_${g.id}`]);
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

describe("unlocking without sending the password", () => {
  const PW = "long-enough-password";

  async function graphWithKey() {
    const u = await makeUser();
    const g = await makeGraph(u.id, { passwordHash: hashPassword(PW), indexAccess: "password" });
    await db.insert(lockKey).values({ scope: "graph", targetId: g.id, ...newLockKey(PW) });
    request.cookies.clear();
    return g;
  }
  const proofFor = async (id: string, password: string) => {
    const { salt } = await unlockSalt({ scope: "graph", id });
    return unlockProof(await passwordKey(password, salt!));
  };

  test("a proof made from the right password unlocks and hands back the key; a wrong one doesn't", async () => {
    const g = await graphWithKey();
    const wrong = await unlockWithProof({ scope: "graph", id: g.id, proof: await proofFor(g.id, "not-the-password") });
    expect(wrong).toMatchObject({ ok: false, message: "That password isn't right." });
    expect(wrong.key).toBeUndefined();
    expect(request.cookies.size).toBe(0);

    const res = await unlockWithProof({ scope: "graph", id: g.id, proof: await proofFor(g.id, PW) });
    expect(res).toMatchObject({ ok: true, version: 0 });
    expect([...request.cookies.keys()]).toEqual([`rp_unlock_graph_${g.id}`]);
    // The browser opens the key it got back with the key it derived from the password.
    const { salt } = await unlockSalt({ scope: "graph", id: g.id });
    expect(await unwrapPrivateKey(res.key!.wrappedPrivateKey, await passwordKey(PW, salt!))).not.toBeNull();
    const [counted] = await db.select().from(passwordUnlock).where(eq(passwordUnlock.targetId, g.id));
    expect(counted.unlocks).toBe(1);
  });

  test("a password set before proofs gets one at its next unlock, and takes proofs from then on", async () => {
    const g = await graphWithKey();
    await db.update(lockKey).set({ proofHash: null });
    expect(await unlockSalt({ scope: "graph", id: g.id })).toEqual({ salt: null });
    // A browser that tries a proof anyway is told to send the password.
    expect(await unlockWithProof({ scope: "graph", id: g.id, proof: "A".repeat(43) })).toMatchObject({ ok: false, needPassword: true });

    const res = await unlock({ scope: "graph", id: g.id, password: PW });
    expect(res).toMatchObject({ ok: true, key: { wrappedPrivateKey: expect.any(String) } });
    expect(await unlockSalt({ scope: "graph", id: g.id })).toEqual({ salt: expect.any(String) });
    request.cookies.clear();
    expect((await unlockWithProof({ scope: "graph", id: g.id, proof: await proofFor(g.id, PW) })).ok).toBe(true);
  });

  test("passwords without a key pair have no salt and unlock with the password", async () => {
    const u = await makeUser();
    const g = await makeGraph(u.id, { passwordHash: hashPassword("short"), indexAccess: "password" });
    expect(await unlockSalt({ scope: "graph", id: g.id })).toEqual({ salt: null });
    expect(await unlock({ scope: "graph", id: g.id, password: "short" })).toMatchObject({ ok: true });
    expect((await unlock({ scope: "graph", id: g.id, password: "short" })).key).toBeUndefined();
  });

  test("unlocking clears the old cookie that carried the password's key to the server", async () => {
    const g = await graphWithKey();
    request.cookies.set(`rp_key_graph_${g.id}`, "v1.old");
    expect((await unlockWithProof({ scope: "graph", id: g.id, proof: await proofFor(g.id, PW) })).ok).toBe(true);
    expect(request.cookies.has(`rp_key_graph_${g.id}`)).toBe(false);
  });

  test("proofs count toward the same limit on guesses", async () => {
    const g = await graphWithKey();
    const wrong = await proofFor(g.id, "guess");
    for (let i = 0; i < 10; i++) await unlockWithProof({ scope: "graph", id: g.id, proof: wrong });
    const r = await unlockWithProof({ scope: "graph", id: g.id, proof: await proofFor(g.id, PW) });
    expect(r).toMatchObject({ ok: false, message: expect.stringContaining("Too many") });
  });
});
