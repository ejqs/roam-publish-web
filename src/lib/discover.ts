import "server-only";
import { and, count, desc, eq, or, type SQL, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { graph, publication, publicationView, publicationVote, user } from "@/db/schema";
import { liveGraph, livePublication } from "@/lib/moderation";
import { graphPlaceOpen } from "@/lib/places";
import { collectionPath, entryPath, graphPath, publicationPath } from "@/lib/publications";
import { plainText } from "@/lib/slug";
import type { DiscoverSort } from "@/lib/discover-sort";

/** Cache tag for everything on /discover and the home page's trending list. */
export const DISCOVER_TAG = "discover";

export type DiscoverRow = {
  id: string;
  rootUid: string;
  kind: "page" | "block";
  title: string;
  graphName: string;
  tags: string[];
  /** The start of the page's text, without the title; empty when the page has none. */
  excerpt: string;
  /** The page's link: its collection place when it's on Discover there, else its graph place. */
  href: string;
  /** Where it's from, as shown: the collection or the graph. */
  source: { label: string; href: string };
  views: number;
  votes: number;
  createdAt: string;
};

/**
 * Conditions on a collection entry `e` (with its collection `c` and owner `o`) for it to be on
 * Discover: listed there, open to everyone, in an open, indexable, live collection.
 */
const entryOnDiscoverWhere = sql`e.listing = 'discover'
  and (e.access = 'open' or (e.access = 'inherit' and c.default_access = 'open'))
  and c.index_access = 'open' and c.indexable and c.suspended_at is null
  and coalesce(o.banned, false) = false`;

const entryFrom = sql`from collection_entry e join collection c on c.id = e.collection_id join "user" o on o.id = c.owner_id`;

/** The publication is on Discover through one of its collections. */
const onDiscoverInCollection = sql`exists (select 1 ${entryFrom} where e.publication_id = ${publication.id} and ${entryOnDiscoverWhere})`;

/** Open, public pages in their graph that the owner chose to list. Needs `graph` and `user` joined. */
const onDiscoverInGraph = and(
  eq(publication.discoverable, true),
  eq(graph.frontPage, true),
  eq(graph.indexable, true),
  eq(graph.indexAccess, "open"),
  eq(publication.visibility, "public"),
  graphPlaceOpen,
) as SQL;

/**
 * Pages on Discover, from their graph or a collection. Needs `graph` and `user` joined; the vote
 * endpoint reuses it so only pages shown here can be upvoted. Protected pages are never included.
 */
export const listedPublication = and(
  liveGraph,
  livePublication,
  or(onDiscoverInGraph, onDiscoverInCollection),
) as SQL;

/** `listedPublication` for a graph (from `loadGraph`) and page that are already loaded. */
export function isListed(
  g: { frontPage: boolean; indexable: boolean; takenDown: boolean; indexAccess: string },
  pub: { visibility: string; discoverable: boolean; removedAt: Date | null; inGraph: boolean },
) {
  return (
    pub.discoverable &&
    pub.visibility === "public" &&
    pub.inGraph &&
    !pub.removedAt &&
    g.frontPage &&
    g.indexable &&
    g.indexAccess === "open" &&
    !g.takenDown
  );
}

/** Characters read from search_text: enough to drop a repeated title and still fill two lines. */
const EXCERPT_SOURCE = 400;
const EXCERPT = 240;

/** One paragraph from the start of the page's text, minus the title when the text repeats it. */
export function excerpt(text: string, title: string) {
  let s = text.replace(/\s+/g, " ").trim();
  const t = plainText(title).trim();
  if (t && s.toLowerCase().startsWith(t.toLowerCase())) s = s.slice(t.length).trimStart();
  return s.length > EXCERPT ? `${s.slice(0, EXCERPT).trimEnd()}…` : s;
}

async function query(sort: DiscoverSort, limit: number, offset: number) {
  // Views in the last 7 days, aggregated over the created_at index only.
  const recentViews = db
    .select({ publicationId: publicationView.publicationId, views: count().as("recent_view_count") })
    .from(publicationView)
    .where(sql`${publicationView.createdAt} > now() - interval '7 days'`)
    .groupBy(publicationView.publicationId)
    .as("recent_views");
  const views = sql<number>`coalesce(${recentViews.views}, 0)`.mapWith(Number);
  // All-time upvotes, grouped over the primary key.
  const allVotes = db
    .select({ publicationId: publicationVote.publicationId, votes: count().as("vote_count") })
    .from(publicationVote)
    .groupBy(publicationVote.publicationId)
    .as("all_votes");
  const votes = sql<number>`coalesce(${allVotes.votes}, 0)`.mapWith(Number);

  // Prefer a collection place: pages there were put on Discover by that collection.
  const pick = (col: string) =>
    sql<string | null>`(select ${sql.raw(col)} ${entryFrom} where e.publication_id = ${publication.id} and ${entryOnDiscoverWhere} order by e.added_at limit 1)`;
  const base = db
    .select({
      id: publication.id,
      rootUid: publication.rootUid,
      kind: publication.kind,
      title: publication.title,
      graphName: graph.name,
      tags: publication.tags,
      text: sql<string>`left(${publication.searchText}, ${EXCERPT_SOURCE})`,
      entryUid: pick("e.entry_uid"),
      collectionName: pick("c.name"),
      collectionSlug: pick("c.slug"),
      views,
      votes,
      createdAt: publication.createdAt,
    })
    .from(publication)
    .innerJoin(graph, eq(graph.id, publication.graphId))
    .innerJoin(user, eq(user.id, graph.userId))
    .leftJoin(recentViews, eq(recentViews.publicationId, publication.id))
    .leftJoin(allVotes, eq(allVotes.publicationId, publication.id))
    .where(listedPublication);

  const [[{ total }], rows] = await Promise.all([
    db
      .select({ total: count() })
      .from(publication)
      .innerJoin(graph, eq(graph.id, publication.graphId))
      .innerJoin(user, eq(user.id, graph.userId))
      .where(listedPublication),
    base
      .orderBy(...{ recent: [], trending: [desc(views)], top: [desc(votes)] }[sort], desc(publication.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  return {
    total,
    rows: rows.map(({ entryUid, collectionName, collectionSlug, text, ...r }): DiscoverRow => ({
      ...r,
      excerpt: excerpt(text, r.title),
      href: entryUid && collectionSlug ? entryPath(collectionSlug, entryUid, r.title) : publicationPath(r.graphName, r.rootUid, r.title),
      source:
        entryUid && collectionName && collectionSlug
          ? { label: collectionName, href: collectionPath(collectionSlug) }
          : { label: r.graphName, href: graphPath(r.graphName) },
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/**
 * Cached for five minutes so traffic never multiplies the aggregate. Dashboard actions bust the
 * tag when listings change; view and vote counts are allowed to lag.
 */
export const discoverPublications = unstable_cache(query, ["discover-publications-v4"], {
  revalidate: 300,
  tags: [DISCOVER_TAG],
});

export type DiscoverCollection = {
  slug: string;
  name: string;
  description: string;
  pages: number;
  /** Views of its pages in the last 7 days. */
  views: number;
  /** All-time upvotes of its pages. */
  votes: number;
  /** When a page was last added to it, or when it was made. */
  updatedAt: string;
  /** Its newest open pages' titles, for the tile. */
  titles: string[];
};

/** Collections whose owners listed them on Discover: open, indexable and live. Needs `c` and `o`. */
const collectionOnDiscover = sql`c.discoverable and c.index_access = 'open' and c.indexable
  and c.suspended_at is null and coalesce(o.banned, false) = false`;

/**
 * Collections on Discover, ranked by their pages: Recent by the page added last, Trending by their
 * pages' views this week, Top by their pages' upvotes. Pages count when they're listed on the
 * collection's front page; only open ones lend their titles.
 */
async function collectionsQuery(sort: DiscoverSort, limit: number, offset: number) {
  const order = {
    recent: sql`updated_at desc`,
    trending: sql`views desc, updated_at desc`,
    top: sql`votes desc, updated_at desc`,
  }[sort];
  const [{ rows: [{ total }] }, { rows }] = await Promise.all([
    db.execute<{ total: number }>(sql`
      select count(*)::int as total from collection c join "user" o on o.id = c.owner_id where ${collectionOnDiscover}`),
    db.execute<{
      slug: string;
      name: string;
      description: string;
      pages: number;
      views: number;
      votes: number;
      updated_at: Date | string;
      titles: string[] | null;
    }>(sql`
      with listed as (
        select e.collection_id, e.publication_id, e.added_at, p.title,
          (e.access = 'open' or (e.access = 'inherit' and c.default_access = 'open')) and p.cipher is null as open
        from collection_entry e
        join collection c on c.id = e.collection_id
        join "user" o on o.id = c.owner_id
        join publication p on p.id = e.publication_id
        where ${collectionOnDiscover} and e.listing <> 'unlisted' and p.removed_at is null
      )
      select c.slug, c.name, c.description,
        (select count(*)::int from listed l where l.collection_id = c.id) as pages,
        (select count(*)::int from publication_view v join listed l on l.publication_id = v.publication_id
          where l.collection_id = c.id and v.created_at > now() - interval '7 days') as views,
        (select count(*)::int from publication_vote v join listed l on l.publication_id = v.publication_id
          where l.collection_id = c.id) as votes,
        greatest(c.created_at, (select max(l.added_at) from listed l where l.collection_id = c.id)) as updated_at,
        array(select l.title from listed l where l.collection_id = c.id and l.open order by l.added_at desc limit 3) as titles
      from collection c
      join "user" o on o.id = c.owner_id
      where ${collectionOnDiscover}
      order by ${order}, c.created_at desc
      limit ${limit} offset ${offset}`),
  ]);
  return {
    total,
    rows: rows.map(
      (r): DiscoverCollection => ({
        slug: r.slug,
        name: r.name,
        description: r.description,
        pages: r.pages,
        views: r.views,
        votes: r.votes,
        updatedAt: new Date(r.updated_at).toISOString(),
        titles: r.titles ?? [],
      }),
    ),
  };
}

export const discoverCollections = unstable_cache(collectionsQuery, ["discover-collections-v2"], {
  revalidate: 300,
  tags: [DISCOVER_TAG],
});

/** The most used tags across pages on Discover, most used first. */
async function tagsQuery(): Promise<string[]> {
  const tag = sql<string>`unnest(${publication.tags})`;
  const rows = await db
    .select({ tag: tag.as("tag"), n: count().as("n") })
    .from(publication)
    .innerJoin(graph, eq(graph.id, publication.graphId))
    .innerJoin(user, eq(user.id, graph.userId))
    .where(listedPublication)
    .groupBy(sql`tag`)
    .orderBy(desc(sql`n`), sql`tag`)
    .limit(20);
  return rows.map((r) => r.tag);
}

export const discoverTags = unstable_cache(tagsQuery, ["discover-tags"], {
  revalidate: 300,
  tags: [DISCOVER_TAG],
});

/** How many of this user's own pages are on Discover. Per reader, so never cached. */
export async function ownListedCount(userId: string) {
  const [{ n }] = await db
    .select({ n: count() })
    .from(publication)
    .innerJoin(graph, eq(graph.id, publication.graphId))
    .innerJoin(user, eq(user.id, graph.userId))
    .where(and(listedPublication, or(eq(graph.userId, userId), eq(publication.publishedBy, userId))));
  return n;
}
