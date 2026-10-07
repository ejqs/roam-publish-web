import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { updateEntry } from "@/server/actions/places";
import { db } from "@/db";
import { changelogEntry, collection, graph, shortlink } from "@/db/schema";
import { encryptToken } from "@/lib/append-token";
import { setChangeLogOptions } from "@/server/actions/change-log";
import { type Change, flushChangeLog, logChanges, mergeLines, queueChanges, recordAnchorCheck, roamInert } from "@/lib/changelog";
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

/** Runs the background sender as if `minutes` had passed, with the block confirmed meanwhile. */
async function flushAfter(minutes: number) {
  // A second past it: a batch's entries are stamped a millisecond apart from when it was logged, so on a fast
  // database the last one can still be "in the future" when this runs, and the page wouldn't count as quiet yet.
  const at = new Date(Date.now() + minutes * 60_000 + 1_000);
  await db.update(shortlink).set({ anchorConfirmedAt: at });
  await flushChangeLog(at);
}

/** Logs changes for the page in one go, as one request would. */
async function log(page: { graphId: string; rootUid: string }, changes: [Change["category"], string][]) {
  logChanges(changes.map(([category, text]) => ({ ...page, category, text })));
  await runAfter();
}

type Body = { location: { block: { uid: string }; "nest-under"?: { string: string } }; "append-data": { string: string }[] };
const sentLines = (call: { body: unknown }) => (call.body as Body)["append-data"].map((d) => d.string);
const nestUnder = (call: { body: unknown }) => (call.body as Body).location["nest-under"]?.string;

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
    logChange({ graphId: g.id, rootUid: pub.rootUid }, "listing", "Made public");
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
    logChange({ graphId: g.id, rootUid: pub.rootUid }, "listing", "Made public");
    await runAfter();
    await flushChangeLog(new Date(Date.now() + 5 * 60_000));
    expect(roam.calls).toHaveLength(0);
  });

  test("a rejected token stops all writes for the graph", async () => {
    roam.restore();
    roam = fakeRoam(401);
    const { g, pub } = await loggedPage();
    const { logChange } = await import("@/lib/changelog");
    logChange({ graphId: g.id, rootUid: pub.rootUid }, "listing", "Made public");
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

describe("mergeLines", () => {
  test("keeps the last change to each setting, in the entry where it happened", () => {
    expect(
      mergeLines(
        ["Access in the graph: Password; Password in the graph changed", "Access in the graph: Open", "Tags changed on the website: +#a"],
        [],
      ),
    ).toEqual(["Password in the graph changed", "Access in the graph: Open", "Tags changed on the website: +#a"]);
  });

  test("drops a final value Roam already shows, but never an event", () => {
    expect(mergeLines(["Made unlisted", "Made public"], ["Tags changed on the website: +#a", "Made public"])).toEqual([null, null]);
    expect(mergeLines(["Republished"], ["Republished"])).toEqual(["Republished"]);
    expect(mergeLines(["Republished", "Republished"], [])).toEqual([null, "Republished"]);
  });

  test("settings in different places are separate", () => {
    expect(mergeLines(["Access in the graph: Open", "Access in [C](http://x/c/c): Password"], [])).toEqual([
      "Access in the graph: Open",
      "Access in [C](http://x/c/c): Password",
    ]);
  });
});

describe("change log in Roam", () => {
  test("back-and-forth changes go to Roam once, under the day's block; the history keeps them all", async () => {
    const { g, pub } = await loggedPage();
    const page = { graphId: g.id, rootUid: pub.rootUid };
    await log(page, [
      ["access", "Access in the graph: Open"],
      ["access", "Access in the graph: Password"],
      ["access", "Access in the graph: Open"],
      ["access", "Access in the graph: Password"],
    ]);
    await flushAfter(5);
    expect(roam.calls).toHaveLength(1);
    expect(sentLines(roam.calls[0])).toEqual([expect.stringMatching(/^\d\d:\d\d UTC Access in the graph: Password$/)]);
    expect(nestUnder(roam.calls[0])).toMatch(/^\[\[\w+ \d+(st|nd|rd|th), \d{4}\]\]$/);
    const rows = await queued();
    expect(rows).toHaveLength(4);
    expect(rows.filter((r) => r.status === "merged")).toHaveLength(3);
    expect(rows.find((r) => r.status === "sent")?.roamText).toBe("Access in the graph: Password");
  });

  test("changes within 5 minutes of each other merge; the send waits until 5 minutes have passed", async () => {
    const { g, pub } = await loggedPage();
    const page = { graphId: g.id, rootUid: pub.rootUid };
    const t0 = new Date(Date.now() - 20 * 60_000);
    const at = (min: number) => new Date(t0.getTime() + min * 60_000);
    await queueChanges([{ ...page, category: "listing", text: "Made unlisted" }], t0);
    await queueChanges([{ ...page, category: "listing", text: "Made public" }], at(4));
    const flush = async (min: number) => {
      await db.update(shortlink).set({ anchorConfirmedAt: at(min) });
      await flushChangeLog(at(min));
    };
    await flush(5);
    expect(roam.calls).toHaveLength(0);
    await flush(9);
    expect(roam.calls.flatMap(sentLines)).toEqual([expect.stringContaining("Made public")]);
  });

  test("without merging, a quiet page is sent after 30 seconds", async () => {
    const { g, pub } = await loggedPage();
    await db.update(graph).set({ changeLogMerge: false }).where(eq(graph.id, g.id));
    const t0 = new Date(Date.now() - 20 * 60_000);
    await queueChanges([{ graphId: g.id, rootUid: pub.rootUid, category: "listing", text: "Made public" }], t0);
    const at = new Date(t0.getTime() + 60_000);
    await db.update(shortlink).set({ anchorConfirmedAt: at });
    await flushChangeLog(at);
    expect(roam.calls).toHaveLength(1);
  });

  test("changing a setting back to what Roam already shows adds nothing", async () => {
    const { g, pub } = await loggedPage();
    const page = { graphId: g.id, rootUid: pub.rootUid };
    await log(page, [["access", "Access in the graph: Password"]]);
    await flushAfter(5);
    await log(page, [
      ["access", "Access in the graph: Open"],
      ["access", "Access in the graph: Password"],
    ]);
    await flushAfter(10);
    expect(roam.calls).toHaveLength(1);
    expect((await queued()).filter((r) => r.status === "merged")).toHaveLength(2);
  });

  test("a kind of change the owner left out stays in the history only; moderation always goes", async () => {
    const { g, pub } = await loggedPage();
    await db.update(graph).set({ changeLogOff: ["listing", "moderation"] }).where(eq(graph.id, g.id));
    const page = { graphId: g.id, rootUid: pub.rootUid };
    await log(page, [
      ["listing", "Made public"],
      ["moderation", "Restored by a moderator"],
    ]);
    await flushAfter(5);
    expect(roam.calls.flatMap(sentLines)).toEqual([expect.stringContaining("Restored by a moderator")]);
    const rows = await queued();
    expect(rows.find((r) => r.text === "Made public")?.status).toBe("local");
    expect(rows.find((r) => r.text === "Made public")?.category).toBe("listing");
  });

  test("with merging and grouping off, every change is its own dated line", async () => {
    const { g, pub } = await loggedPage();
    await db.update(graph).set({ changeLogMerge: false, changeLogByDay: false }).where(eq(graph.id, g.id));
    await log({ graphId: g.id, rootUid: pub.rootUid }, [
      ["access", "Access in the graph: Open"],
      ["access", "Access in the graph: Password"],
    ]);
    await flushAfter(5);
    expect(roam.calls).toHaveLength(1);
    expect(nestUnder(roam.calls[0])).toBeUndefined();
    expect(sentLines(roam.calls[0])).toEqual([
      expect.stringMatching(/^\[\[.+\]\] \d\d:\d\d UTC Access in the graph: Open$/),
      expect.stringMatching(/^\[\[.+\]\] \d\d:\d\d UTC Access in the graph: Password$/),
    ]);
  });

  test("a send across midnight goes under each day's block", async () => {
    const { g, pub } = await loggedPage();
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);
    midnight.setUTCDate(midnight.getUTCDate() - 1);
    const page = { graphId: g.id, rootUid: pub.rootUid };
    await queueChanges([{ ...page, category: "tags", text: "Tags changed on the website: +#a" }], new Date(midnight.getTime() - 60_000));
    await queueChanges([{ ...page, category: "tags", text: "Tags changed on the website: +#b" }], new Date(midnight.getTime() + 60_000));
    await flushAfter(5);
    expect(roam.calls).toHaveLength(2);
    expect(nestUnder(roam.calls[0])).not.toBe(nestUnder(roam.calls[1]));
    expect(sentLines(roam.calls[0])).toEqual(["23:59 UTC Tags changed on the website: +#a"]);
    expect(sentLines(roam.calls[1])).toEqual(["00:01 UTC Tags changed on the website: +#b"]);
  });

  test("a rate-limited send keeps the changes and merges them on the retry", async () => {
    roam.restore();
    roam = fakeRoam(429);
    const { g, pub } = await loggedPage();
    await log({ graphId: g.id, rootUid: pub.rootUid }, [
      ["listing", "Made unlisted"],
      ["listing", "Made public"],
    ]);
    await flushAfter(5);
    expect((await queued()).find((r) => r.text === "Made public")?.status).toBe("pending");
    roam.restore();
    roam = fakeRoam();
    await flushAfter(60);
    expect(roam.calls.flatMap(sentLines)).toEqual([expect.stringContaining("Made public")]);
  });
});

describe("change log options", () => {
  test("only the graph's owner can change them, to known kinds", async () => {
    const { owner, g } = await loggedPage();
    actAs(owner);
    expect((await setChangeLogOptions(g.id, { off: ["tags"], merge: false, byDay: true }))?.ok).toBe(true);
    const row = await db.query.graph.findFirst({ where: eq(graph.id, g.id) });
    expect([row?.changeLogOff, row?.changeLogMerge, row?.changeLogByDay]).toEqual([["tags"], false, true]);
    expect((await setChangeLogOptions(g.id, { off: ["moderation"], merge: true, byDay: true }))?.ok).toBe(false);
    actAs(await makeUser());
    expect((await setChangeLogOptions(g.id, { off: [], merge: true, byDay: true }))?.ok).toBe(false);
  });
});
