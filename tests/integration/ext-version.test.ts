import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { GET, OPTIONS } from "@/app/api/ext/publications/route";
import { db } from "@/db";
import { extClient, user } from "@/db/schema";
import { EXT_MIN_VERSION, EXT_MIN_VERSION_HEADER, EXT_VERSION_HEADER } from "@/lib/ext-compat";
import { everyoneAtLeast, extVersionUse, leftBehind, readyFor, runExtVersionCheck } from "@/lib/ext-version";
import { resetDb } from "../helpers/db";
import { extRequest, keyFor, makeGraph, makeUser } from "../helpers/factories";
import { request, resetRequest, runAfter } from "../helpers/request";

const call = (key: string, version?: string) => {
  const req = extRequest("/api/ext/publications", key);
  if (version !== undefined) req.headers.set(EXT_VERSION_HEADER, version);
  return GET(req);
};

let owner: Awaited<ReturnType<typeof makeUser>>;
let g: Awaited<ReturnType<typeof makeGraph>>;
let key: string;

beforeEach(async () => {
  await resetDb();
  resetRequest();
  owner = await makeUser();
  g = await makeGraph(owner.id);
  key = await keyFor(owner.id, g);
});

describe("which extension versions are in use", () => {
  test("each call records the version it says, or none for older extensions", async () => {
    expect((await call(key)).status).toBe(200);
    await runAfter();
    expect(await db.select().from(extClient)).toMatchObject([{ userId: owner.id, graphId: g.id, version: null }]);
    await call(key, "0.2.0");
    await runAfter();
    expect((await db.select().from(extClient))[0].version).toBe("0.2.0");
  });

  test("nonsense in the header counts as no version", async () => {
    await call(key, "<script>");
    await runAfter();
    expect((await db.select().from(extClient))[0].version).toBeNull();
  });

  test("counts people per version, newest first, and says when everyone has caught up", async () => {
    const other = await makeUser();
    const g2 = await makeGraph(other.id);
    await call(key, "0.2.0");
    await call(await keyFor(other.id, g2));
    await runAfter();
    expect((await extVersionUse()).map((r) => [r.version, r.people])).toEqual([
      ["0.2.0", 1],
      [null, 1],
    ]);
    expect(await everyoneAtLeast("0.2.0")).toBe(false);
    // What a release needing 0.2.0 would leave behind, which stops a production deploy (scripts/ext-gate.ts).
    expect((await leftBehind("0.2.0")).map((r) => [r.version, r.people])).toEqual([[null, 1]]);
    expect(await readyFor("0.2.0")).toEqual({ ready: 1, total: 2 });
    await call(await keyFor(other.id, g2), "0.10.0");
    await runAfter();
    expect((await extVersionUse()).map((r) => r.version)).toEqual(["0.10.0", "0.2.0"]);
    expect(await everyoneAtLeast("0.2.0")).toBe(true);
    // Installs quiet for longer than the window don't hold anything back.
    await db.update(extClient).set({ lastSeenAt: new Date(Date.now() - 40 * 86_400_000) }).where(eq(extClient.version, "0.2.0"));
    expect(await everyoneAtLeast("0.10.0")).toBe(true);
    expect(await leftBehind("0.10.0")).toEqual([]);
  });
});

describe("what roam.pub tells the extension", () => {
  test("every answer names the oldest extension this website works with, and Roam may read it", async () => {
    expect((await call(key)).headers.get(EXT_MIN_VERSION_HEADER)).toBe(EXT_MIN_VERSION);
    expect((await call("rp_nope")).headers.get(EXT_MIN_VERSION_HEADER)).toBe(EXT_MIN_VERSION);
    const pre = await OPTIONS(extRequest("/api/ext/publications", null, { method: "OPTIONS" }));
    expect(pre.headers.get("access-control-allow-headers")).toContain(EXT_VERSION_HEADER);
    expect(pre.headers.get("access-control-expose-headers")).toContain(EXT_MIN_VERSION_HEADER);
  });
});

describe("the everyone-has-updated email", () => {
  beforeEach(async () => {
    await db.update(user).set({ role: "admin" }).where(eq(user.id, owner.id));
    request.emails = [];
  });
  const live = (v: string | null) => async () => v;

  test("goes once per release, when every active install is on it", async () => {
    const cursor: Record<string, unknown> = {};
    await call(key);
    await runAfter();
    expect(await runExtVersionCheck(cursor, new Date(), live("0.2.0"))).toMatchObject({ ready: 0 });
    expect(request.emails).toHaveLength(0);

    await call(key, "0.2.0");
    await runAfter();
    expect(await runExtVersionCheck(cursor, new Date(), live("0.2.0"))).toMatchObject({ ready: 1, sent: 1 });
    expect(request.emails).toHaveLength(1);
    expect(request.emails[0]).toContain("Everyone is on extension 0.2.0");
    expect(await runExtVersionCheck(cursor, new Date(), live("0.2.0"))).toBeNull();
    expect(request.emails).toHaveLength(1);
  });

  test("says nothing while Roam Depot can't be read or nobody has called", async () => {
    expect(await runExtVersionCheck({}, new Date(), live(null))).toBeNull();
    expect(await runExtVersionCheck({}, new Date(), live("0.2.0"))).toMatchObject({ people: 0, ready: 0 });
    expect(request.emails).toHaveLength(0);
  });
});
