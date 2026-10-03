import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { verifyGraph } from "@/app/(app)/onboarding/actions";
import { db } from "@/db";
import { blockedIdentity, graph } from "@/db/schema";
import { decryptToken } from "@/lib/append-token";
import { resetDb } from "../helpers/db";
import { actAs, makeUser } from "../helpers/factories";
import { fakeRoam } from "../helpers/roam";
import { resetRequest } from "../helpers/request";

const TOKEN = "roam-graph-token-abc123";
const input = (graphName: string) => ({ graphName, token: TOKEN, date: "10-02-2026", timeZone: "Europe/Berlin" });

let roam: ReturnType<typeof fakeRoam>;
beforeEach(async () => {
  await resetDb();
  resetRequest();
  roam = fakeRoam();
});
afterEach(() => roam.restore());

describe("verifyGraph", () => {
  test("first verifier owns the graph; the token is stored encrypted", async () => {
    const u = await makeUser();
    actAs(u);
    const r = await verifyGraph(input("my-graph"));
    expect(r.ok).toBe(true);
    expect(roam.calls[0].url).toContain("/api/graph/my-graph/append-blocks");
    expect(roam.calls[0].auth).toBe(`Bearer ${TOKEN}`);
    const g = await db.query.graph.findFirst({ where: eq(graph.name, "my-graph") });
    expect(g?.userId).toBe(u.id);
    expect(g?.appendTokenEnc).not.toContain(TOKEN);
    expect(decryptToken(g!.appendTokenEnc!)).toBe(TOKEN);
    expect(g?.timeZone).toBe("Europe/Berlin");
  });

  test("someone else can't take over a verified graph, even with a working token", async () => {
    const a = await makeUser();
    const b = await makeUser();
    actAs(a);
    await verifyGraph(input("taken"));
    actAs(b);
    const r = await verifyGraph(input("taken"));
    expect(r.ok).toBe(false);
    expect(roam.calls).toHaveLength(1);
    const g = await db.query.graph.findFirst({ where: eq(graph.name, "taken") });
    expect(g?.userId).toBe(a.id);
  });

  test("a token Roam rejects verifies nothing", async () => {
    roam.restore();
    roam = fakeRoam(403);
    actAs(await makeUser());
    expect((await verifyGraph(input("nope"))).ok).toBe(false);
    expect(await db.select().from(graph)).toHaveLength(0);
  });

  test("a blocklisted graph name can't be connected", async () => {
    await db.insert(blockedIdentity).values({ kind: "graph", value: "banned-graph" });
    actAs(await makeUser());
    expect((await verifyGraph(input("banned-graph"))).ok).toBe(false);
    expect(roam.calls).toHaveLength(0);
  });

  test("names that would shadow site routes are refused", async () => {
    actAs(await makeUser());
    for (const name of ["dashboard", "Admin", "api"]) expect((await verifyGraph(input(name))).ok).toBe(false);
  });

  // /search and /settings are routes too, so a graph with that name would have no reachable front page.
  test("search and settings are reserved too", async () => {
    actAs(await makeUser());
    for (const name of ["search", "settings"]) expect((await verifyGraph(input(name))).ok).toBe(false);
  });

  test("signed out or with a malformed token, nothing is sent to Roam", async () => {
    actAs(null);
    expect((await verifyGraph(input("x"))).ok).toBe(false);
    actAs(await makeUser());
    expect((await verifyGraph({ ...input("x"), token: "not-a-token" })).ok).toBe(false);
    expect((await verifyGraph({ ...input("bad/name") })).ok).toBe(false);
    expect(roam.calls).toHaveLength(0);
  });
});
