import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { updateEntry } from "@/app/(app)/dashboard/place-actions";
import { db } from "@/db";
import { changelogEntry, collection, graph, shortlink } from "@/db/schema";
import { encryptToken } from "@/lib/append-token";
import { flushChangeLog, recordAnchorCheck, roamInert } from "@/lib/changelog";
import { addEntry } from "@/lib/collections";
import { ensureShortlink, setAnchor } from "@/lib/shortlinks";
import { resetDb } from "../helpers/db";
import { actAs, addCollectionMember, makeCollection, makeGraph, makePublication, makeUser } from "../helpers/factories";
import { fakeRoam } from "../helpers/roam";
import { resetRequest, runAfter } from "../helpers/request";

let roam: ReturnType<typeof fakeRoam>;
beforeEach(async () => {
  await resetDb();
  resetRequest();
  roam = fakeRoam();
});
afterEach(() => roam.restore());

/** A graph with a working token and a published page whose Changelog block was just confirmed. */
async function loggedPage() {
  const owner = await makeUser();
  const g = await makeGraph(owner.id, { appendTokenEnc: encryptToken("roam-graph-token-t"), appendTokenStatus: "ok" });
  const pub = await makePublication(g.id, owner.id);
  await ensureShortlink(g.id, pub.rootUid);
  await setAnchor(g.id, pub.rootUid, "anchor123");
  return { owner, g, pub };
}

const queued = () => db.select().from(changelogEntry);

describe("roamInert", () => {
  test("leaves plain names alone and defuses Roam markup", () => {
    expect(roamInert("Reading list (2026)")).toBe("Reading list (2026)");
    expect(roamInert("a [[b]] {{c}} ((abcdefghi)) #d `e`")).toBe("a b c ( (abcdefghi) ) #\u200bd e");
    expect(roamInert("line\nbreak")).toBe("line break");
  });
});

describe("change log", () => {
  test("sends queued entries once, under the confirmed block, with the stored token", async () => {
    const { g, pub } = await loggedPage();
    const { logChange } = await import("@/lib/changelog");
    logChange({ graphId: g.id, rootUid: pub.rootUid }, "Made public");
    await runAfter();
    const later = new Date(Date.now() + 5 * 60_000);
    await db.update(shortlink).set({ anchorConfirmedAt: later });
    await flushChangeLog(later);
    await flushChangeLog(new Date(later.getTime() + 60_000));
    expect(roam.calls).toHaveLength(1);
    expect(roam.calls[0].auth).toBe("Bearer roam-graph-token-t");
    expect(JSON.stringify(roam.calls[0].body)).toContain('"uid":"anchor123"');
    expect((await queued())[0].status).toBe("sent");
  });

  test("never writes to a block the extension hasn't confirmed recently", async () => {
    const { g, pub } = await loggedPage();
    await recordAnchorCheck(g.id, [], [{ rootUid: pub.rootUid, anchorUid: "anchor123" }]);
    const { logChange } = await import("@/lib/changelog");
    logChange({ graphId: g.id, rootUid: pub.rootUid }, "Made public");
    await runAfter();
    await flushChangeLog(new Date(Date.now() + 5 * 60_000));
    expect(roam.calls).toHaveLength(0);
  });

  test("a rejected token stops all writes for the graph", async () => {
    roam.restore();
    roam = fakeRoam(401);
    const { g, pub } = await loggedPage();
    const { logChange } = await import("@/lib/changelog");
    logChange({ graphId: g.id, rootUid: pub.rootUid }, "Made public");
    await runAfter();
    const later = new Date(Date.now() + 5 * 60_000);
    await db.update(shortlink).set({ anchorConfirmedAt: later });
    await flushChangeLog(later);
    const row = await db.query.graph.findFirst({ where: eq(graph.id, g.id) });
    expect(row?.appendTokenStatus).toBe("invalid");
  });

  // A collection's name is chosen by its owner, who may be outside the graph, and goes into the graph's Roam.
  test("text another person controls can't inject Roam markup into the graph", async () => {
    const { owner, pub } = await loggedPage();
    const outsider = await makeUser();
    await makeGraph(outsider.id);
    const c = await makeCollection(outsider.id);
    await addCollectionMember(c.id, owner.id);
    const entry = (await addEntry(c.id, pub.id, owner.id))!;
    await db
      .update(collection)
      .set({ name: "Reading {{iframe: https://evil.example}} [[Spam page]]" })
      .where(eq(collection.id, c.id));
    actAs(outsider);
    expect((await updateEntry(entry.id, { listing: "unlisted" })).ok).toBe(true);
    await runAfter();
    const texts = (await queued()).map((e) => e.text).join("\n");
    expect(texts).toContain("Unlisted");
    expect(texts).not.toContain("{{");
    expect(texts).not.toContain("[[");
    // Still a working link, with the name readable.
    expect(texts).toMatch(/\[Reading iframe: https:\/\/evil\.example Spam page\]\(http:\/\/localhost:3000\/c\//);
  });
});
