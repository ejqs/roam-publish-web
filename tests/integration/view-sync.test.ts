import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import GraphPage from "@/app/[graph]/[uid]/[[...slug]]/page";
import { PublicationView } from "@/components/publication-view";
import { db } from "@/db";
import { backgroundJob, collectionEntry, cPath, pageViews, publication, publicationView } from "@/db/schema";
import { forgetJobRows, type JobDef, requestRun, runJob } from "@/lib/jobs";
import { JOBS } from "@/lib/jobs-registry";
import { UmamiClient } from "@/lib/umami";
import { countrySweep, fullSweep, hotSweep } from "@/lib/view-sync";
import type { ViewFooter } from "@/lib/views-data";
import { resetDb } from "../helpers/db";
import { actAs, makeCollection, makeGraph, makePublication, makeUser } from "../helpers/factories";
import { findElements } from "../helpers/render";
import { resetRequest } from "../helpers/request";
import { fakeUmami, type UmamiCall } from "../helpers/umami";

const HOUR = 60 * 60_000;
let umami: ReturnType<typeof fakeUmami> | null = null;

beforeEach(async () => {
  await resetDb();
  resetRequest();
  forgetJobRows();
});
afterEach(() => {
  umami?.restore();
  umami = null;
});

async function setup() {
  const owner = await makeUser();
  const g = await makeGraph(owner.id, { name: "notes" });
  const listed = await makePublication(g.id, owner.id, { rootUid: "aaa", title: "Listed", visibility: "public" });
  const unlisted = await makePublication(g.id, owner.id, { rootUid: "bbb", title: "Unlisted" });
  const off = await makePublication(g.id, owner.id, { rootUid: "ccc", title: "Off", visibility: "public", views: "off" });
  const c = await makeCollection(owner.id, { slug: "reading" });
  await db.insert(cPath).values({ path: "e1", kind: "entry" });
  const [entry] = await db
    .insert(collectionEntry)
    .values({
      collectionId: c.id,
      publicationId: unlisted.id,
      entryUid: "e1",
      listing: "listed",
      originGraphName: g.name,
      originRootUid: unlisted.rootUid,
    })
    .returning();
  return { owner, g, listed, unlisted, off, c, entry };
}

const rowFor = async (where: { publicationId?: string; entryId?: string }) =>
  db.query.pageViews.findFirst({
    where: where.entryId ? eq(pageViews.entryId, where.entryId) : eq(pageViews.publicationId, where.publicationId!),
  });

describe("full sweep", () => {
  test("sums slug variants per place, skips pages with views off and paths that aren't pages", async () => {
    const { listed, unlisted, entry } = await setup();
    umami = fakeUmami(() => [
      { x: "/notes/aaa/listed", y: 30 },
      { x: "/notes/aaa", y: 5 },
      { x: "/notes/bbb/unlisted", y: 4 },
      { x: "/notes/ccc", y: 50 },
      { x: "/c/reading/e1/unlisted", y: 12 },
      { x: "/dashboard/notes", y: 99 },
    ]);
    const cursor: Record<string, unknown> = {};
    const now = new Date();
    const result = await fullSweep(new UmamiClient(), cursor, now);

    expect(umami.calls[0]).toMatchObject({ type: "path", key: "test-umami-key" });
    expect(result).toMatchObject({ calls: 1, pages: 3, complete: true });
    expect(await rowFor({ publicationId: listed.id })).toMatchObject({ views: 35, baseline: 35, path: "/notes/aaa/listed" });
    // Unlisted pages are tracked too: their managers see the count.
    expect(await rowFor({ publicationId: unlisted.id })).toMatchObject({ views: 4 });
    expect(await rowFor({ entryId: entry.id })).toMatchObject({ views: 12 });
    expect(await db.select().from(pageViews)).toHaveLength(3);
    expect(cursor.fullSweepAt).toBe(now.toISOString());
  });

  test("drops pages Umami stopped reporting", async () => {
    const { listed } = await setup();
    umami = fakeUmami(() => [{ x: "/notes/aaa", y: 20 }]);
    await fullSweep(new UmamiClient(), {});
    umami.restore();
    umami = fakeUmami(() => []);
    expect(await fullSweep(new UmamiClient(), {})).toMatchObject({ removed: 1 });
    expect(await rowFor({ publicationId: listed.id })).toBeUndefined();
  });
});

describe("hot sweep", () => {
  test("adds views since the full sweep to pages that are due, and moves pages up the country queue", async () => {
    const { g, owner, listed } = await setup();
    const t0 = new Date();
    umami = fakeUmami(() => [{ x: "/notes/aaa", y: 90 }]);
    await fullSweep(new UmamiClient(), {}, t0);
    const fresh = await makePublication(g.id, owner.id, { rootUid: "ddd", title: "New", visibility: "public" });
    umami.restore();

    const calls: UmamiCall[] = [];
    umami = fakeUmami((call) => {
      calls.push(call);
      return [
        { x: "/notes/aaa", y: 20 },
        { x: "/notes/ddd/new", y: 3 },
      ];
    });
    // Within the hour, the listed page's count of 90 isn't due yet.
    const early = await hotSweep(new UmamiClient(), t0, new Date(t0.getTime() + 30 * 60_000));
    expect(early).toMatchObject({ waiting: 1, added: 1 });
    expect(calls[0].startAt).toBe(t0.getTime());
    expect(await rowFor({ publicationId: listed.id })).toMatchObject({ views: 90 });
    expect(await rowFor({ publicationId: fresh.id })).toMatchObject({ views: 3, baseline: 0 });

    const later = new Date(t0.getTime() + 2 * HOUR);
    expect(await hotSweep(new UmamiClient(), t0, later)).toMatchObject({ updated: 2 });
    const row = await rowFor({ publicationId: listed.id });
    expect(row).toMatchObject({ views: 110, baseline: 90 });
    // 90 → 110 crossed into the next bracket: countries are due again now.
    expect(row!.countriesNextSyncAt.getTime()).toBe(later.getTime());
    expect(row!.nextSyncAt.getTime()).toBe(later.getTime() + 3 * HOUR);
  });

  test("waits for the first full sweep", async () => {
    umami = fakeUmami(() => []);
    expect(await hotSweep(new UmamiClient(), null)).toMatchObject({ skipped: expect.any(String) });
    expect(umami.calls).toHaveLength(0);
  });
});

describe("country sweep", () => {
  async function tracked() {
    const s = await setup();
    umami = fakeUmami(() => [
      { x: "/notes/aaa", y: 40 },
      { x: "/notes/bbb", y: 40 },
      { x: "/c/reading/e1", y: 5 },
    ]);
    await fullSweep(new UmamiClient(), {});
    umami.restore();
    return s;
  }

  test("public listed pages go first, small counts are skipped, and a budget caps the calls", async () => {
    const { listed, unlisted } = await tracked();
    umami = fakeUmami((call) => (call.params.get("path") === "/notes/aaa" ? [{ x: "PH", y: 30 }, { x: "IS", y: 1 }] : [{ x: "DE", y: 9 }]));
    const result = await countrySweep(new UmamiClient(), 1, {});
    expect(result).toMatchObject({ calls: 1, pages: 1 });
    expect(umami.calls[0]).toMatchObject({ type: "country" });
    expect((await rowFor({ publicationId: listed.id }))!.countries).toEqual([
      { code: "PH", views: 30 },
      { code: "other", views: 1 },
    ]);
    // Then the unlisted one, whose count only its managers see. The entry has too few views to look up.
    expect(await countrySweep(new UmamiClient(), 10, {})).toMatchObject({ calls: 1, pages: 1 });
    expect((await rowFor({ publicationId: unlisted.id }))!.countries).toEqual([{ code: "DE", views: 9 }]);
    expect(await countrySweep(new UmamiClient(), 10, {})).toMatchObject({ calls: 0 });
  });

  test("stops at a rate limit and remembers when", async () => {
    await tracked();
    umami = fakeUmami(() => 429);
    const cursor: Record<string, unknown> = {};
    expect(await countrySweep(new UmamiClient(), 10, cursor)).toMatchObject({ pages: 0, rateLimited: true });
    expect(typeof cursor.lastRateLimitedAt).toBe("string");
  });
});

describe("job runner", () => {
  const job = (run: JobDef["run"], patch: Partial<JobDef> = {}): JobDef => ({
    name: "test-job",
    label: "Test",
    description: "",
    schedule: "Hourly",
    intervalMs: HOUR,
    exclusive: true,
    disabledReason: () => null,
    run,
    ...patch,
  });

  test("one run at a time across callers, then not again until due", async () => {
    let runs = 0;
    const j = job(async () => {
      runs++;
      await new Promise((r) => setTimeout(r, 50));
      return { done: 1 };
    });
    expect(await Promise.all([runJob(j), runJob(j)])).toEqual(expect.arrayContaining([true, false]));
    expect(runs).toBe(1);
    expect(await runJob(j)).toBe(false);
    await requestRun(j.name);
    expect(await runJob(j)).toBe(true);
    const row = await db.query.backgroundJob.findFirst({ where: eq(backgroundJob.name, j.name) });
    expect(row).toMatchObject({ runCount: 2, lastResult: { done: 1 }, consecutiveFailures: 0, lockedUntil: null });
  });

  test("records failures, backs off, and keeps the cursor", async () => {
    const j = job(async ({ cursor }) => {
      cursor.tried = true;
      throw new Error("boom");
    }, { name: "failing-job" });
    const before = Date.now();
    await runJob(j);
    const row = await db.query.backgroundJob.findFirst({ where: eq(backgroundJob.name, j.name) });
    expect(row).toMatchObject({ lastError: "boom", consecutiveFailures: 1, failCount: 1, cursor: { tried: true } });
    expect(row!.nextDueAt.getTime()).toBeGreaterThanOrEqual(before + 2 * HOUR);
  });

  test("Umami jobs are off without an API key", async () => {
    const key = process.env.UMAMI_API_KEY;
    delete process.env.UMAMI_API_KEY;
    try {
      const sweep = JOBS.find((j) => j.name === "umami-full-sweep")!;
      expect(sweep.disabledReason()).toBe("no UMAMI_API_KEY");
      expect(await runJob(sweep)).toBe(false);
    } finally {
      process.env.UMAMI_API_KEY = key;
    }
  });
});

describe("footer", () => {
  async function render(as: Awaited<ReturnType<typeof makeUser>> | null, g: { name: string }, rootUid: string) {
    actAs(as);
    const out = await GraphPage({ params: Promise.resolve({ graph: g.name, uid: rootUid }) } as never);
    const view = findElements(out as never, PublicationView)[0];
    return view ? ((view.props.views ?? null) as ViewFooter | null) : "gated";
  }

  test("visitors see listed counts; managers also see hidden ones; off hides them from everyone", async () => {
    const { owner, g, listed, unlisted, off } = await setup();
    await db.insert(pageViews).values([
      { publicationId: listed.id, path: "/notes/aaa", views: 1400, baseline: 1400 },
      { publicationId: unlisted.id, path: "/notes/bbb", views: 50, baseline: 50 },
      { publicationId: off.id, path: "/notes/ccc", views: 50, baseline: 50 },
    ]);
    const reader = await makeUser();
    await db.insert(publicationView).values({ publicationId: listed.id, userId: reader.id });

    expect(await render(null, g, "aaa")).toMatchObject({ total: 1400, umami: 1400, roam: 1, hidden: false, few: false });
    expect(await render(null, g, "bbb")).toBeNull();
    expect(await render(owner, g, "bbb")).toMatchObject({ total: 50, hidden: true });
    expect(await render(owner, g, "ccc")).toBeNull();
  });

  test("a small public count reads as fewer than ten", async () => {
    const { g } = await setup();
    expect(await render(null, g, "aaa")).toMatchObject({ total: 0, few: true, manager: false, flags: false });
  });

  test("managers of a busy password-protected page get a warning", async () => {
    const { owner, g, listed } = await setup();
    await db.update(publication).set({ access: "password", passwordHash: "x" }).where(eq(publication.id, listed.id));
    await db.insert(pageViews).values({ publicationId: listed.id, path: "/notes/aaa", views: 150, baseline: 150 });
    expect(await render(owner, g, "aaa")).toMatchObject({ passwordWarning: true });
    expect(await render(null, g, "aaa")).toBe("gated");
  });
});
