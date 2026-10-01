import { and, count, desc, eq, type SQL, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { graph, publication, publicationView, publicationVote, user } from "@/db/schema";
import { liveGraph, livePublication } from "@/lib/moderation";
import type { DiscoverSort } from "@/app/discover/sort";

/** Cache tag for everything on /discover and the home page's trending list. */
export const DISCOVER_TAG = "discover";

export type DiscoverRow = {
  rootUid: string;
  title: string;
  graphName: string;
  views: number;
  votes: number;
  createdAt: string;
};

/**
 * Public pages the owner chose to list. Needs `graph` and `user` joined; the vote endpoint reuses
 * it so only pages shown here can be upvoted.
 */
export const listedPublication = and(
  eq(publication.discoverable, true),
  eq(graph.frontPage, true),
  eq(graph.indexable, true),
  liveGraph,
  eq(publication.visibility, "public"),
  livePublication,
) as SQL;

/** `listedPublication` for a graph (from `loadGraph`) and page that are already loaded. */
export function isListed(
  g: { frontPage: boolean; indexable: boolean; takenDown: boolean },
  pub: { visibility: string; discoverable: boolean; removedAt: Date | null },
) {
  return (
    pub.discoverable && pub.visibility === "public" && !pub.removedAt && g.frontPage && g.indexable && !g.takenDown
  );
}

async function query(sort: DiscoverSort, limit: number, offset: number) {
  // Views in the last 7 days, aggregated over the created_at index only.
  const recentViews = db
    .select({ publicationId: publicationView.publicationId, views: count().as("views") })
    .from(publicationView)
    .where(sql`${publicationView.createdAt} > now() - interval '7 days'`)
    .groupBy(publicationView.publicationId)
    .as("recent_views");
  const views = sql<number>`coalesce(${recentViews.views}, 0)`.mapWith(Number);
  // All-time upvotes, grouped over the primary key.
  const allVotes = db
    .select({ publicationId: publicationVote.publicationId, votes: count().as("votes") })
    .from(publicationVote)
    .groupBy(publicationVote.publicationId)
    .as("all_votes");
  const votes = sql<number>`coalesce(${allVotes.votes}, 0)`.mapWith(Number);

  const base = db
    .select({
      rootUid: publication.rootUid,
      title: publication.title,
      graphName: graph.name,
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
    rows: rows.map((r): DiscoverRow => ({ ...r, createdAt: r.createdAt.toISOString() })),
  };
}

/**
 * Cached for five minutes so traffic never multiplies the aggregate. Dashboard actions bust the
 * tag when listings change; view and vote counts are allowed to lag.
 */
export const discoverPublications = unstable_cache(query, ["discover-publications"], {
  revalidate: 300,
  tags: [DISCOVER_TAG],
});
