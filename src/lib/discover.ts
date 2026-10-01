import { and, count, desc, eq, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/db";
import { graph, publication, publicationView, user } from "@/db/schema";
import { liveGraph, livePublication } from "@/lib/moderation";
import type { DiscoverSort } from "@/app/discover/sort";

/** Cache tag for everything on /discover and the home page's trending list. */
export const DISCOVER_TAG = "discover";

export type DiscoverRow = {
  rootUid: string;
  title: string;
  graphName: string;
  views: number;
  createdAt: string;
};

// Public pages the owner chose to list: the page's own setting, else the graph's default.
const listed = and(
  sql`coalesce(${publication.discoverable}, ${graph.featured})`,
  eq(graph.frontPage, true),
  eq(graph.indexable, true),
  liveGraph,
  eq(publication.visibility, "public"),
  livePublication,
);

async function query(sort: DiscoverSort, limit: number, offset: number) {
  // Views in the last 7 days, aggregated over the created_at index only.
  const recentViews = db
    .select({ publicationId: publicationView.publicationId, views: count().as("views") })
    .from(publicationView)
    .where(sql`${publicationView.createdAt} > now() - interval '7 days'`)
    .groupBy(publicationView.publicationId)
    .as("recent_views");
  const views = sql<number>`coalesce(${recentViews.views}, 0)`.mapWith(Number);

  const base = db
    .select({
      rootUid: publication.rootUid,
      title: publication.title,
      graphName: graph.name,
      views,
      createdAt: publication.createdAt,
    })
    .from(publication)
    .innerJoin(graph, eq(graph.id, publication.graphId))
    .innerJoin(user, eq(user.id, graph.userId))
    .leftJoin(recentViews, eq(recentViews.publicationId, publication.id))
    .where(listed);

  const [[{ total }], rows] = await Promise.all([
    db
      .select({ total: count() })
      .from(publication)
      .innerJoin(graph, eq(graph.id, publication.graphId))
      .innerJoin(user, eq(user.id, graph.userId))
      .where(listed),
    (sort === "trending"
      ? base.orderBy(desc(views), desc(publication.createdAt))
      : base.orderBy(desc(publication.createdAt))
    )
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
 * tag when listings change; view counts are allowed to lag.
 */
export const discoverPublications = unstable_cache(query, ["discover-publications"], {
  revalidate: 300,
  tags: [DISCOVER_TAG],
});
