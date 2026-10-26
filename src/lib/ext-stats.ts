import "server-only";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { collectionEntry, pageViews, publication, publicationView, publicationVote } from "@/db/schema";
import { collectionsOf } from "./collections";
import type { ExtContext } from "./ext-auth";
import { primaryUrls } from "./places";
import { collectionUrl } from "./publications";
import { DAYS_KEPT, utcDay } from "./view-sync";
import { foldCountries, totalViews } from "./views";

/** Periods the extension's dashboard offers; "all" still draws the last DAYS_KEPT days by day. */
export const STATS_PERIODS = ["7", "30", "all"] as const;
export type StatsPeriod = (typeof STATS_PERIODS)[number];

const DAY = 24 * 60 * 60_000;
const TOP_PAGES = 5;

/**
 * Stats for the extension's dashboard: the graph's pages for its owner, a member's own pages for a
 * member. Every number is one roam.pub already keeps; nothing new is tracked about readers. Views
 * per day come from page_views_day (lib/view-sync.ts), so they start when that began.
 */
export async function extStats(ctx: ExtContext, period: StatsPeriod, now = new Date()) {
  const pubs = await db
    .select({
      id: publication.id,
      rootUid: publication.rootUid,
      kind: publication.kind,
      title: publication.title,
      inGraph: publication.inGraph,
      encrypted: publication.encrypted,
      createdAt: publication.createdAt,
      updatedAt: publication.updatedAt,
    })
    .from(publication)
    .where(
      and(
        eq(publication.graphId, ctx.graphId),
        isNull(publication.removedAt),
        ctx.role === "owner" ? undefined : eq(publication.publishedBy, ctx.userId),
      ),
    );
  const ids = pubs.map((p) => p.id);
  const days = period === "all" ? DAYS_KEPT : Number(period);
  const from = utcDay(new Date(now.getTime() - (days - 1) * DAY));
  const inPeriod = (at: Date) => period === "all" || utcDay(at) >= from;

  // Each page's places: its graph place and its collection entries, each with its own Umami count.
  const entries = ids.length
    ? await db
        .select({ id: collectionEntry.id, publicationId: collectionEntry.publicationId })
        .from(collectionEntry)
        .where(inArray(collectionEntry.publicationId, ids))
    : [];
  const entryPub = new Map(entries.map((e) => [e.id, e.publicationId]));
  const places = ids.length
    ? await db
        .select({ id: pageViews.id, publicationId: pageViews.publicationId, entryId: pageViews.entryId, views: pageViews.views, countries: pageViews.countries })
        .from(pageViews)
        .where(
          entries.length
            ? sql`${inArray(pageViews.publicationId, ids)} or ${inArray(pageViews.entryId, entries.map((e) => e.id))}`
            : inArray(pageViews.publicationId, ids),
        )
    : [];
  const umami = new Map<string, number>();
  const countryRows: { x: string; y: number }[] = [];
  for (const p of places) {
    const pubId = p.publicationId ?? entryPub.get(p.entryId!)!;
    umami.set(pubId, (umami.get(pubId) ?? 0) + p.views);
    for (const c of p.countries ?? []) countryRows.push({ x: c.code, y: c.views });
  }

  const [roamRows, voteRows] = ids.length
    ? await Promise.all([
        db.select({ id: publicationView.publicationId, at: publicationView.createdAt }).from(publicationView).where(inArray(publicationView.publicationId, ids)),
        db.select({ id: publicationVote.publicationId, at: publicationVote.createdAt }).from(publicationVote).where(inArray(publicationVote.publicationId, ids)),
      ])
    : [[], []];
  const tally = (rows: { id: string }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.id, (m.get(r.id) ?? 0) + 1);
    return m;
  };
  const roam = tally(roamRows);
  const votes = tally(voteRows);

  // A day's views are its last count minus the day before's; the first day a place was counted has none to compare.
  const umamiDays = places.length
    ? (
        await db.execute<{ day: string; views: number }>(sql`
          select day::text as day, sum(gained)::int as views from (
            select day, greatest(views - lag(views) over (partition by page_views_id order by day), 0) as gained
            from page_views_day
            where page_views_id in (${sql.join(places.map((p) => sql`${p.id}`), sql`, `)})
              and day >= ${from}::date - 1
          ) d
          where day >= ${from}::date
          group by day`)
      ).rows
    : [];
  const byDay = new Map<string, { umami: number; roam: number }>();
  for (let t = new Date(`${from}T00:00:00Z`).getTime(); t <= now.getTime(); t += DAY) byDay.set(utcDay(new Date(t)), { umami: 0, roam: 0 });
  for (const r of umamiDays) {
    const d = byDay.get(r.day);
    if (d) d.umami = Number(r.views);
  }
  for (const r of roamRows) {
    const d = byDay.get(utcDay(r.at));
    if (d) d.roam++;
  }
  // As on each page: Umami misses readers with ad blockers, Roam readers are only the signed-in ones.
  const viewsByDay = [...byDay].map(([day, v]) => ({ day, views: totalViews(v) }));
  const [dailySince] = places.length
    ? (
        await db.execute<{ day: string | null }>(sql`
          select min(day)::text as day from page_views_day
          where page_views_id in (${sql.join(places.map((p) => sql`${p.id}`), sql`, `)})`)
      ).rows
    : [];

  const viewsOf = (id: string) => totalViews({ umami: umami.get(id) ?? 0, roam: roam.get(id) ?? 0 });
  const top = [...pubs]
    .map((p) => ({ p, views: viewsOf(p.id), upvotes: votes.get(p.id) ?? 0 }))
    .filter((t) => t.views > 0 || t.upvotes > 0)
    .sort((a, b) => b.views - a.views || b.upvotes - a.upvotes)
    .slice(0, TOP_PAGES);
  const urls = await primaryUrls(ctx.graphName, top.map((t) => t.p));

  // Days anything was published or republished: from the change log, where pages have one, and each page's own dates.
  const published = new Set<string>();
  for (const p of pubs) for (const at of [p.createdAt, p.updatedAt]) if (inPeriod(at)) published.add(utcDay(at));
  if (pubs.length) {
    const logged = await db.execute<{ day: string }>(sql`
      select distinct (e.created_at at time zone 'UTC')::date::text as day
      from changelog_entry e join shortlink s on s.id = e.shortlink_id
      where s.graph_id = ${ctx.graphId}
        and s.root_uid in (${sql.join(pubs.map((p) => sql`${p.rootUid}`), sql`, `)})
        and e.category = 'publishing'
        and (${period === "all"} or e.created_at >= ${from}::date)`);
    for (const r of logged.rows) published.add(r.day);
  }

  const collections = (await collectionsOf(ctx.userId)).filter((c) => !c.suspendedAt);
  const pageCounts = collections.length
    ? new Map(
        (
          await db
            .select({ id: collectionEntry.collectionId, n: count() })
            .from(collectionEntry)
            .where(inArray(collectionEntry.collectionId, collections.map((c) => c.id)))
            .groupBy(collectionEntry.collectionId)
        ).map((r) => [r.id, r.n]),
      )
    : new Map<string, number>();

  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  return {
    period,
    /** The first day of the period, UTC. */
    from,
    /** The first day views were counted by day, when that's after `from`. */
    dailySince: dailySince?.day ?? null,
    pages: pubs.filter((p) => p.kind === "page").length,
    blocks: pubs.filter((p) => p.kind === "block").length,
    encrypted: pubs.filter((p) => p.encrypted).length,
    views: {
      total: pubs.reduce((n, p) => n + viewsOf(p.id), 0),
      period: viewsByDay.reduce((n, d) => n + d.views, 0),
      byDay: viewsByDay,
    },
    upvotes: { total: sum(votes), period: voteRows.filter((v) => inPeriod(v.at)).length },
    countries: foldCountries(countryRows),
    top: top.map(({ p, views, upvotes }) => ({
      rootUid: p.rootUid,
      kind: p.kind,
      /** "Encrypted page" for encrypted pages: the extension shows its title from Roam. */
      title: p.title,
      encrypted: p.encrypted,
      url: urls.get(p.id)!,
      views,
      upvotes,
    })),
    firstPublishedAt: pubs.length ? new Date(Math.min(...pubs.map((p) => p.createdAt.getTime()))).toISOString() : null,
    publishingDays: published.size,
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      url: collectionUrl(c.slug),
      role: c.role,
      pages: pageCounts.get(c.id) ?? 0,
    })),
  };
}
