import "server-only";
import { asc, eq, inArray, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { db } from "@/db";
import { collection, collectionEntry, graph, publication } from "@/db/schema";
import { entryUrl, publicationUrl } from "./publications";

/**
 * Places (a page in a graph, or an entry in a collection) a reader who isn't a member can open
 * without a password or signing in, given the place's `access` column and its container's default.
 * Front pages search, excerpt and count tags only from these; listed protected pages show by title.
 */
export const openInContainer = (access: SQLWrapper, defaultAccess: string): SQL =>
  defaultAccess === "open" ? sql`${access} in ('open', 'inherit')` : sql`${access} = 'open'`;

/**
 * The graph place exists and is readable by anyone; mirrors `effectiveAccess` in gates.ts for
 * queries. Needs `graph` joined.
 */
export const graphPlaceOpen = sql`(${publication.inGraph} and (${publication.access} = 'open' or (${publication.access} = 'inherit' and ${graph.defaultAccess} = 'open')))` as SQL;

/**
 * The link the extension shows for each page: its graph place, or its first collection place when
 * it's only in collections.
 */
export async function primaryUrls(graphName: string, pubs: { id: string; rootUid: string; title: string; inGraph: boolean }[]) {
  const onlyInCollections = pubs.filter((p) => !p.inGraph).map((p) => p.id);
  const entries = onlyInCollections.length
    ? await db
        .select({ publicationId: collectionEntry.publicationId, entryUid: collectionEntry.entryUid, slug: collection.slug })
        .from(collectionEntry)
        .innerJoin(collection, eq(collection.id, collectionEntry.collectionId))
        .where(inArray(collectionEntry.publicationId, onlyInCollections))
        .orderBy(asc(collectionEntry.addedAt))
    : [];
  const first = new Map<string, { entryUid: string; slug: string }>();
  for (const e of entries) if (!first.has(e.publicationId)) first.set(e.publicationId, e);
  return new Map(
    pubs.map((p) => {
      const e = first.get(p.id);
      return [p.id, !p.inGraph && e ? entryUrl(e.slug, e.entryUid, p.title) : publicationUrl(graphName, p.rootUid, p.title)];
    }),
  );
}

/** Collections a graph's new pages join, limited to the ones the publisher belongs to, and whether each takes its pages out of the graph. */
export async function defaultCollectionsFor(graphId: string, publisherId: string) {
  const rows = await db.execute<{ id: string; leaves_graph: boolean }>(sql`
    select c.id, c.pages_leave_graph as leaves_graph from graph_default_collection d
    join collection c on c.id = d.collection_id
    where d.graph_id = ${graphId}
      and c.suspended_at is null
      and (c.owner_id = ${publisherId}
        or exists (select 1 from collection_member m where m.collection_id = c.id and m.user_id = ${publisherId}))
  `);
  return rows.rows.map((r) => ({ id: r.id, leavesGraph: r.leaves_graph }));
}

