import { type AnyColumn, and, asc, eq, inArray, lte, min, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  collection,
  collectionEntry,
  graph,
  pageViews,
  publication,
  type JobResult,
} from "@/db/schema";
import { countCalls } from "./jobs";
import { type Metric, UmamiClient, UmamiRateLimited } from "./umami";
import { foldCountries, MIN_SHOWN_VIEWS, viewsMode } from "./views";

/**
 * Keeps page_views in step with Umami without spending an API call per page:
 *
 * - The daily full sweep reads every path's all-time views in one paged call and resets each page's
 *   baseline, so every page is refreshed at least once a day.
 * - The hourly hot sweep reads only the views since the full sweep, so the pages that come back are
 *   the ones being read right now. Each gets baseline + recent views, unless its count is big
 *   enough that it's not due yet: bigger counts change less in their rounded form.
 * - Countries take one call per page, so they get a budget per run, most overdue first: pages
 *   showing them publicly on a listed place, then unlisted ones, and only then pages whose count
 *   only their managers see.
 *
 * Every place whose views aren't "off" is tracked (lib/gates.ts viewsMode).
 */

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

/** How long a count stands before the hot sweep updates it again. */
export function refreshInterval(views: number) {
  if (views < 100) return HOUR;
  if (views < 1000) return 3 * HOUR;
  if (views < 10_000) return 12 * HOUR;
  return DAY;
}

/** Which refresh bracket a count is in; moving brackets moves a page up the country queue. */
const tier = (views: number) => (views < MIN_SHOWN_VIEWS ? 0 : views < 100 ? 1 : views < 1000 ? 2 : views < 10_000 ? 3 : 4);

export type ParsedPath = { kind: "entry"; entryUid: string } | { kind: "publication"; graph: string; rootUid: string };

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/**
 * A path from Umami to the place it shows: /c/{collection}/{entryUid}/{slug} or
 * /{graph}/{rootUid}/{slug}, slug optional. Anything else is null; lookups weed out paths that
 * merely look like a page, such as /dashboard/x.
 */
export function parseUmamiPath(path: string): ParsedPath | null {
  const segs = path.split(/[?#]/)[0].split("/").filter(Boolean).map(decode);
  if (segs[0] === "c") return segs.length === 3 || segs.length === 4 ? { kind: "entry", entryUid: segs[2].toLowerCase() } : null;
  if (segs.length === 2 || segs.length === 3) return { kind: "publication", graph: segs[0], rootUid: segs[1] };
  return null;
}

type Place = {
  key: string;
  publicationId: string | null;
  entryId: string | null;
  views: number;
  /** The variant with the most views, for country lookups. */
  path: string;
  pathViews: number;
};

const CHUNK = 1000;
const chunks = <T>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, (i + 1) * CHUNK));

/** Sums Umami's paths into the trackable places they belong to. */
export async function resolvePlaces(rows: Metric[]): Promise<Map<string, Place>> {
  const pubPaths: { m: Metric & { x: string }; graph: string; rootUid: string }[] = [];
  const entryPaths: { m: Metric & { x: string }; entryUid: string }[] = [];
  for (const m of rows) {
    if (!m.x || m.y <= 0) continue;
    const p = parseUmamiPath(m.x);
    if (p?.kind === "publication") pubPaths.push({ m: m as Metric & { x: string }, graph: p.graph, rootUid: p.rootUid });
    else if (p?.kind === "entry") entryPaths.push({ m: m as Metric & { x: string }, entryUid: p.entryUid });
  }

  const pubIds = new Map<string, string>(); // "graph\0rootUid" -> publication id
  for (const part of chunks([...new Set(pubPaths.map((p) => p.rootUid))])) {
    const found = await db
      .select({
        id: publication.id,
        rootUid: publication.rootUid,
        graph: graph.name,
        visibility: publication.visibility,
        views: publication.views,
        containerViews: graph.views,
      })
      .from(publication)
      .innerJoin(graph, eq(graph.id, publication.graphId))
      .where(and(inArray(publication.rootUid, part), eq(publication.inGraph, true), sql`${publication.removedAt} is null`))
      .then((rs) =>
        rs.filter((r) => viewsMode({ views: r.containerViews }, r, r.visibility === "public") !== "off"),
      );
    for (const f of found) pubIds.set(`${f.graph}\0${f.rootUid}`, f.id);
  }
  const entryIds = new Map<string, string>();
  for (const part of chunks([...new Set(entryPaths.map((e) => e.entryUid))])) {
    const found = await db
      .select({
        id: collectionEntry.id,
        entryUid: collectionEntry.entryUid,
        listing: collectionEntry.listing,
        views: collectionEntry.views,
        containerViews: collection.views,
      })
      .from(collectionEntry)
      .innerJoin(collection, eq(collection.id, collectionEntry.collectionId))
      .where(inArray(collectionEntry.entryUid, part))
      .then((rs) => rs.filter((r) => viewsMode({ views: r.containerViews }, r, r.listing !== "unlisted") !== "off"));
    for (const f of found) entryIds.set(f.entryUid, f.id);
  }

  const places = new Map<string, Place>();
  const add = (key: string, ids: Pick<Place, "publicationId" | "entryId">, m: Metric & { x: string }) => {
    const p = places.get(key);
    if (!p) return void places.set(key, { key, ...ids, views: m.y, path: m.x, pathViews: m.y });
    p.views += m.y;
    if (m.y > p.pathViews) Object.assign(p, { path: m.x, pathViews: m.y });
  };
  for (const { m, graph: g, rootUid } of pubPaths) {
    const id = pubIds.get(`${g}\0${rootUid}`);
    if (id) add(`p:${id}`, { publicationId: id, entryId: null }, m);
  }
  for (const { m, entryUid } of entryPaths) {
    const id = entryIds.get(entryUid);
    if (id) add(`e:${id}`, { publicationId: null, entryId: id }, m);
  }
  return places;
}

const keyOf = (r: { publicationId: string | null; entryId: string | null }) =>
  r.publicationId ? `p:${r.publicationId}` : `e:${r.entryId}`;

/** Umami has nothing before the first page was published, so all-time starts there. */
async function since() {
  const [r] = await db.select({ at: min(publication.createdAt) }).from(publication);
  return r?.at ?? new Date(Date.now() - DAY);
}

type Row = typeof pageViews.$inferInsert;

async function upsert(rows: Row[]) {
  const set = {
    path: sql`excluded.path`,
    baseline: sql`excluded.baseline`,
    views: sql`excluded.views`,
    syncedAt: sql`excluded.synced_at`,
    nextSyncAt: sql`excluded.next_sync_at`,
    countriesNextSyncAt: sql`excluded.countries_next_sync_at`,
  };
  for (const part of chunks(rows.filter((r) => r.publicationId)))
    await db.insert(pageViews).values(part).onConflictDoUpdate({ target: pageViews.publicationId, set });
  for (const part of chunks(rows.filter((r) => r.entryId)))
    await db.insert(pageViews).values(part).onConflictDoUpdate({ target: pageViews.entryId, set });
}

type Existing = Pick<typeof pageViews.$inferSelect, "id" | "publicationId" | "entryId" | "baseline" | "views" | "nextSyncAt" | "countriesNextSyncAt">;
const existingCols = {
  id: pageViews.id,
  publicationId: pageViews.publicationId,
  entryId: pageViews.entryId,
  baseline: pageViews.baseline,
  views: pageViews.views,
  nextSyncAt: pageViews.nextSyncAt,
  countriesNextSyncAt: pageViews.countriesNextSyncAt,
};

/** A new bracket (or a first count) puts the page at the front of the country queue. */
const countriesDue = (old: Existing | undefined, views: number, now: Date) =>
  !old || tier(old.views) !== tier(views) ? now : old.countriesNextSyncAt;

/** Resets every tracked page to its all-time count. Saves `fullSweepAt` in the cursor for the hot sweep. */
export async function fullSweep(client: UmamiClient, cursor: Record<string, unknown>, now = new Date()): Promise<JobResult> {
  const { rows, complete } = await client.allMetrics("path", await since(), now);
  const places = await resolvePlaces(rows);
  const existing = new Map((await db.select(existingCols).from(pageViews)).map((r) => [keyOf(r), r]));
  await upsert(
    [...places.values()].map((p) => ({
      publicationId: p.publicationId,
      entryId: p.entryId,
      path: p.path,
      baseline: p.views,
      views: p.views,
      syncedAt: now,
      nextSyncAt: new Date(now.getTime() + refreshInterval(p.views)),
      countriesNextSyncAt: countriesDue(existing.get(p.key), p.views, now),
    })),
  );
  // Pages Umami no longer reports (unpublished, made unlisted, renamed graph) stop showing a count.
  // Only when the sweep saw everything, or a cut-off list would wipe real counts.
  const gone = complete ? [...existing.values()].filter((r) => !places.has(keyOf(r))).map((r) => r.id) : [];
  for (const part of chunks(gone)) await db.delete(pageViews).where(inArray(pageViews.id, part));
  cursor.fullSweepAt = now.toISOString();
  return { calls: client.calls, paths: rows.length, pages: places.size, removed: gone.length, complete };
}

/** Adds views since the last full sweep to the pages being read now, where they're due. */
export async function hotSweep(client: UmamiClient, fullSweepAt: Date | null, now = new Date()): Promise<JobResult> {
  if (!fullSweepAt) return { skipped: "waiting for the first full sweep" };
  const { rows } = await client.allMetrics("path", fullSweepAt, now);
  const places = await resolvePlaces(rows);
  const list = [...places.values()];
  const existing = new Map<string, Existing>();
  for (const part of chunks(list.filter((p) => p.publicationId).map((p) => p.publicationId!)))
    for (const r of await db.select(existingCols).from(pageViews).where(inArray(pageViews.publicationId, part)))
      existing.set(keyOf(r), r);
  for (const part of chunks(list.filter((p) => p.entryId).map((p) => p.entryId!)))
    for (const r of await db.select(existingCols).from(pageViews).where(inArray(pageViews.entryId, part)))
      existing.set(keyOf(r), r);

  let waiting = 0;
  const added: Row[] = [];
  for (const p of list) {
    const old = existing.get(p.key);
    if (!old) {
      // First views since the full sweep: nothing before it.
      added.push({
        publicationId: p.publicationId,
        entryId: p.entryId,
        path: p.path,
        baseline: 0,
        views: p.views,
        syncedAt: now,
        nextSyncAt: new Date(now.getTime() + refreshInterval(p.views)),
        countriesNextSyncAt: now,
      });
      continue;
    }
    if (old.nextSyncAt > now) {
      waiting++;
      continue;
    }
    const views = old.baseline + p.views;
    await db
      .update(pageViews)
      .set({
        views,
        syncedAt: now,
        nextSyncAt: new Date(now.getTime() + refreshInterval(views)),
        countriesNextSyncAt: countriesDue(old, views, now),
      })
      .where(eq(pageViews.id, old.id));
  }
  await upsert(added);
  return { calls: client.calls, paths: rows.length, updated: list.length - waiting - added.length, added: added.length, waiting };
}

/** SQL twin of viewsMode (lib/gates.ts). */
const modeSql = (own: AnyColumn, container: AnyColumn, listed: SQL) =>
  sql`case when ${own} <> 'inherit' then ${own} when ${container} = 'off' then 'off' when ${listed} then ${container} else 'hide' end`;
/** SQL twin of showsViewCountries. */
const countriesSql = (own: AnyColumn, container: AnyColumn) =>
  sql`case ${own} when 'inherit' then ${container} else ${own} = 'show' end`;

/**
 * Refreshes countries for up to `budget` pages, most overdue first within each priority: public
 * flags on listed pages, then on unlisted ones, then counts only managers see. Stops early on a
 * rate limit and keeps what it got.
 */
export async function countrySweep(
  client: UmamiClient,
  budget: number,
  cursor: Record<string, unknown>,
  now = new Date(),
): Promise<JobResult> {
  const pubListed = sql`${publication.visibility} = 'public'`;
  const entryListed = sql`${collectionEntry.listing} <> 'unlisted'`;
  const listed = sql`coalesce(${pubListed}, ${entryListed})`;
  const mode = sql`coalesce(${modeSql(publication.views, graph.views, pubListed)}, ${modeSql(collectionEntry.views, collection.views, entryListed)})`;
  const flags = sql`coalesce(${countriesSql(publication.showViewCountries, graph.showViewCountries)}, ${countriesSql(collectionEntry.showViewCountries, collection.showViewCountries)})`;
  const priority = sql<number>`case when ${mode} = 'show' and ${flags} then (case when ${listed} then 0 else 1 end) else 2 end`;
  const due = await db
    .select({ id: pageViews.id, path: pageViews.path, views: pageViews.views, priority })
    .from(pageViews)
    .leftJoin(publication, eq(publication.id, pageViews.publicationId))
    .leftJoin(graph, eq(graph.id, publication.graphId))
    .leftJoin(collectionEntry, eq(collectionEntry.id, pageViews.entryId))
    .leftJoin(collection, eq(collection.id, collectionEntry.collectionId))
    .where(and(lte(pageViews.countriesNextSyncAt, now), sql`${pageViews.views} >= ${MIN_SHOWN_VIEWS}`, sql`${mode} <> 'off'`))
    .orderBy(asc(priority), asc(pageViews.countriesNextSyncAt))
    .limit(budget);

  const start = await since();
  let done = 0;
  let rateLimited = false;
  for (const row of due) {
    try {
      const rows = await client.metrics("country", start, now, { filters: { path: row.path }, limit: 250 });
      await db
        .update(pageViews)
        .set({
          countries: foldCountries(rows),
          countriesSyncedAt: now,
          countriesNextSyncAt: new Date(now.getTime() + refreshInterval(row.views)),
        })
        .where(eq(pageViews.id, row.id));
      done++;
    } catch (e) {
      if (!(e instanceof UmamiRateLimited)) throw e;
      rateLimited = true;
      cursor.lastRateLimitedAt = now.toISOString();
      break;
    }
  }
  if (!due.length) return { calls: 0, pages: 0 };
  return { calls: client.calls, pages: done, due: due.length, rateLimited };
}

/** Wraps a sweep so its API calls and any rate limit land in the job's cursor. */
export async function withClient(
  cursor: Record<string, unknown>,
  fn: (client: UmamiClient) => Promise<JobResult>,
): Promise<JobResult> {
  const client = new UmamiClient();
  try {
    return await fn(client);
  } catch (e) {
    if (e instanceof UmamiRateLimited) cursor.lastRateLimitedAt = new Date().toISOString();
    throw e;
  } finally {
    countCalls(cursor, client.calls);
  }
}

/** Stats for /admin/jobs. */
export async function viewSyncStats(now = new Date()) {
  const [r] = await db
    .select({
      tracked: sql<number>`count(*)::int`,
      shown: sql<number>`count(*) filter (where ${pageViews.views} >= ${MIN_SHOWN_VIEWS})::int`,
      countriesDue: sql<number>`count(*) filter (where ${pageViews.views} >= ${MIN_SHOWN_VIEWS} and ${pageViews.countriesNextSyncAt} <= ${now})::int`,
      oldestCountries: min(pageViews.countriesSyncedAt),
      oldestCount: min(pageViews.syncedAt),
    })
    .from(pageViews);
  return r;
}
