import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { whatsNewStamp } from "@/db/schema";
import { forgetWhatsNew, loadWeb, newSince, parseSeen, seenValue, whatsNew } from "@/lib/whats-new";
import { resetDb } from "../helpers/db";

spyOn(console, "error").mockImplementation(() => {});

const SHA = "807ce97b7be966a96f445f802a094323894e16e8";
const EXT_MD = `# Changelog

## Unreleased

### Publishing
- New: Not in Roam Depot yet.

## 0.1.0 (2026-10-04)

### Publishing
- New: Publish from the right-click menu.
- Fixed: Toasts are announced by screen readers.
`;
const LIVE_AT = "2026-10-06T08:15:00Z";

/** Fakes GitHub: Roam Depot's entry (absent while `depot` is null), the changelog at a commit, and the commits API. */
function fakeGitHub(state: { depot: string | null; up?: boolean }) {
  const real = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (state.up === false) return new Response("nope", { status: 503 });
    if (url.includes("/depot/")) return state.depot ? Response.json({ source_commit: state.depot }) : new Response("404", { status: 404 });
    if (url.includes(`/${SHA}/CHANGELOG.md`)) return new Response(EXT_MD);
    if (url.includes("/commits")) return Response.json([{ commit: { committer: { date: LIVE_AT } } }]);
    return new Response("?", { status: 404 });
  }) as typeof fetch;
  return { calls, restore: () => void (globalThis.fetch = real) };
}

let gh: ReturnType<typeof fakeGitHub> | null = null;
beforeEach(async () => {
  await resetDb();
  forgetWhatsNew();
});
afterEach(() => {
  gh?.restore();
  gh = null;
});

describe("website entries", () => {
  test("the first run backfills with section days; a later deploy stamps only what it adds", async () => {
    const boot = Date.parse("2026-10-05T12:00:00Z");
    const first = await loadWeb(boot);
    expect(first.length).toBeGreaterThan(10);
    expect(first.every((e) => e.stampedAt.getTime() === e.date.getTime())).toBe(true);

    // A new deploy with a new version: drop its stamps to stand in for it.
    const added = first.filter((e) => e.version === first[0].version);
    const addedIds = added.map((e) => e.id);
    await db.delete(whatsNewStamp).where(inArray(whatsNewStamp.id, addedIds));
    forgetWhatsNew();
    // After everything already live, as a real deploy is (a fixed date breaks once the changelog passes it).
    const deploy = Math.max(...first.map((e) => e.stampedAt.getTime())) + 60 * 60_000;
    const second = await loadWeb(deploy);
    expect(second.filter((e) => e.stampedAt.getTime() === deploy).map((e) => e.id).sort()).toEqual(addedIds.sort());

    // Someone who visited before that deploy sees just those entries as new.
    const seen = parseSeen(seenValue(first.filter((e) => !addedIds.includes(e.id))) ?? undefined);
    expect([...newSince(second, seen)].sort()).toEqual(addedIds.sort());

    // Restarting the same deploy changes nothing.
    forgetWhatsNew();
    const third = await loadWeb(deploy + 60 * 60_000);
    expect(third.map((e) => e.stampedAt.getTime())).toEqual(second.map((e) => e.stampedAt.getTime()));
  });
});

test("a bullet reworded after its release keeps its release's place", async () => {
  const first = await loadWeb(Date.parse("2026-10-05T12:00:00Z"));
  const old = first.find((e) => e.version && first.some((o) => o !== e && o.version === e.version))!;
  // The reworded bullet is a new id in a version that's already out: stand in for it with a fresh id.
  await db.delete(whatsNewStamp).where(inArray(whatsNewStamp.id, [old.id]));
  await db.update(whatsNewStamp).set({ firstSeenAt: new Date("2026-10-05T12:30:00Z") }).where(
    inArray(whatsNewStamp.id, first.filter((e) => e.version === old.version && e.id !== old.id).map((e) => e.id)),
  );
  forgetWhatsNew();
  const later = await loadWeb(Date.parse("2026-10-06T09:00:00Z"));
  expect(later.find((e) => e.id === old.id)!.stampedAt).toEqual(new Date("2026-10-05T12:30:00Z"));
  expect(later.some((e) => e.stampedAt.getTime() === Date.parse("2026-10-06T09:00:00Z"))).toBe(false);
});

describe("extension entries", () => {
  test("nothing shows while Roam Depot doesn't list the extension", async () => {
    gh = fakeGitHub({ depot: null });
    const all = await whatsNew(Date.parse("2026-10-05T12:00:00Z"));
    expect(all.some((e) => e.source === "ext")).toBe(false);
    expect(all.some((e) => e.source === "web")).toBe(true);
  });

  test("the released versions at Roam Depot's commit, stamped when Roam Depot picked them up", async () => {
    const state = { depot: SHA as string | null, up: true };
    gh = fakeGitHub(state);
    const t = Date.parse("2026-10-06T09:00:00Z");
    const ext = (await whatsNew(t)).filter((e) => e.source === "ext");
    expect(ext.map((e) => [e.kind, e.text])).toEqual([
      ["new", "Publish from the right-click menu."],
      ["fixed", "Toasts are announced by screen readers."],
    ]);
    expect(ext.every((e) => e.version === "0.1.0" && e.stampedAt.toISOString() === new Date(LIVE_AT).toISOString())).toBe(true);
    const calls = gh.calls.length;

    // Checked at most hourly.
    await whatsNew(t + 30 * 60_000);
    expect(gh.calls.length).toBe(calls);

    // GitHub down: keep serving the last copy.
    state.up = false;
    const later = (await whatsNew(t + 2 * 60 * 60_000)).filter((e) => e.source === "ext");
    expect(later).toHaveLength(2);

    // The stamps stick: seen again later, they keep the time they went live.
    state.up = true;
    forgetWhatsNew();
    const again = (await whatsNew(t + 5 * 60 * 60_000)).filter((e) => e.source === "ext");
    expect(again[0].stampedAt.toISOString()).toBe(new Date(LIVE_AT).toISOString());
  });
});
