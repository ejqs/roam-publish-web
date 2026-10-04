import { and, count, desc, eq, ilike, or, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { collection, graph, publication, user } from "@/db/schema";
import { relevance, snippet, snippetParts, tagCounts, tagsMatch, textMatch } from "@/lib/list-query";
import { liveGraph, livePublication } from "@/lib/moderation";
import { graphPlaceOpen } from "@/lib/places";
import { collectionPath, entryPath, graphPath, publicationPath } from "@/lib/publications";

/**
 * Search across the site. Only what anyone can already find by browsing shows up: open pages listed
 * on an open, indexable graph front page or collection. Protected and unlisted pages never do, and
 * Listed (not Discoverable) pages only while their graph or collection allows it (`searchListed`).
 * A Listed page its owner took out of search (`publication.searchable`) doesn't either. Pages on
 * Discover are always searchable.
 */

export const SEARCH_PAGE_SIZE = 20;

/** Listed on its graph's open, indexable front page, and open to read there. Needs `graph` joined. */
const inOpenGraph = and(
  eq(publication.inGraph, true),
  eq(publication.visibility, "public"),
  eq(graph.frontPage, true),
  eq(graph.indexable, true),
  eq(graph.indexAccess, "open"),
  graphPlaceOpen,
) as SQL;

/** `inOpenGraph`, and Discoverable, or Listed where both the graph and the page allow search. */
const inSearchGraph = and(
  inOpenGraph,
  or(eq(publication.discoverable, true), and(eq(graph.searchListed, true), eq(publication.searchable, true))),
) as SQL;

const entryOpenWhere = sql`e.listing <> 'unlisted' and (e.listing = 'discover' or (c.search_listed and ${publication.searchable}))
  and (e.access = 'open' or (e.access = 'inherit' and c.default_access = 'open'))
  and c.index_access = 'open' and c.indexable and c.suspended_at is null
  and coalesce(o.banned, false) = false`;
const entryFrom = sql`from collection_entry e join collection c on c.id = e.collection_id join "user" o on o.id = c.owner_id`;
const inOpenCollection = sql`exists (select 1 ${entryFrom} where e.publication_id = ${publication.id} and ${entryOpenWhere})`;

/** Needs `graph` and `user` joined. */
export const searchablePublication = and(liveGraph, livePublication, or(inSearchGraph, inOpenCollection)) as SQL;

export type SearchSort = "best" | "recent";

export type PageResult = {
  title: string;
  kind: "page" | "block";
  href: string;
  source: { label: string; href: string };
  tags: string[];
  snippet?: { text: string; hit: boolean }[];
  updatedAt: Date;
};

const fromPublications = sql`from ${publication} join ${graph} on ${graph.id} = ${publication.graphId} join ${user} on ${user.id} = ${graph.userId}`;

export async function searchPages(opts: { q: string; tags: string[]; sort: SearchSort; page: number }) {
  const where = and(searchablePublication, textMatch(opts.q), tagsMatch(opts.tags));
  // Prefer the graph place; else the first open collection place.
  const pick = (col: string) =>
    sql<string | null>`(select ${sql.raw(col)} ${entryFrom} where e.publication_id = ${publication.id} and ${entryOpenWhere} order by e.added_at limit 1)`;
  const base = db
    .select({
      rootUid: publication.rootUid,
      title: publication.title,
      kind: publication.kind,
      tags: publication.tags,
      updatedAt: publication.updatedAt,
      graphName: graph.name,
      inGraph: sql<boolean>`${inSearchGraph}`,
      entryUid: pick("e.entry_uid"),
      collectionName: pick("c.name"),
      collectionSlug: pick("c.slug"),
      snippet: opts.q ? snippet(opts.q) : sql<string | null>`null`,
    })
    .from(publication)
    .innerJoin(graph, eq(graph.id, publication.graphId))
    .innerJoin(user, eq(user.id, graph.userId))
    .where(where);
  const order = opts.sort === "best" && opts.q ? [desc(relevance(opts.q)), desc(publication.updatedAt)] : [desc(publication.updatedAt)];
  const [[{ total }], rows, tags] = await Promise.all([
    db
      .select({ total: count() })
      .from(publication)
      .innerJoin(graph, eq(graph.id, publication.graphId))
      .innerJoin(user, eq(user.id, graph.userId))
      .where(where),
    base
      .orderBy(...order, desc(publication.id))
      .limit(SEARCH_PAGE_SIZE)
      .offset((opts.page - 1) * SEARCH_PAGE_SIZE),
    tagCounts(fromPublications, where, 10),
  ]);
  return {
    total,
    tags,
    rows: rows.map((r): PageResult => {
      const viaCollection = !r.inGraph && r.entryUid && r.collectionSlug && r.collectionName;
      return {
        title: r.title,
        kind: r.kind,
        tags: r.tags,
        updatedAt: r.updatedAt,
        snippet: snippetParts(r.snippet),
        href: viaCollection ? entryPath(r.collectionSlug!, r.entryUid!, r.title) : publicationPath(r.graphName, r.rootUid, r.title),
        source: viaCollection
          ? { label: r.collectionName!, href: collectionPath(r.collectionSlug!) }
          : { label: r.graphName, href: graphPath(r.graphName) },
      };
    }),
  };
}

export type PlaceResult = { kind: "graph" | "collection"; name: string; href: string; description: string; pages: number };

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Graphs and collections whose name or description matches. */
export async function searchPlaces(q: string, limit = 4): Promise<PlaceResult[]> {
  if (!q) return [];
  const like = `%${escapeLike(q)}%`;
  const [graphs, collections] = await Promise.all([
    db
      .select({
        name: graph.name,
        description: graph.description,
        pages: sql<number>`(select count(*) from publication p where p.graph_id = ${graph.id} and p.in_graph
          and p.visibility = 'public' and p.removed_at is null)`.mapWith(Number),
      })
      .from(graph)
      .innerJoin(user, eq(user.id, graph.userId))
      .where(
        and(
          liveGraph,
          eq(graph.frontPage, true),
          eq(graph.indexable, true),
          eq(graph.indexAccess, "open"),
          or(ilike(graph.name, like), ilike(graph.description, like)),
        ),
      )
      .orderBy(sql`(${graph.name} ilike ${like}) desc`, graph.name)
      .limit(limit),
    db
      .select({
        name: collection.name,
        slug: collection.slug,
        description: collection.description,
        pages: sql<number>`(select count(*) from collection_entry e join publication p on p.id = e.publication_id
          where e.collection_id = ${collection.id} and e.listing <> 'unlisted' and p.removed_at is null)`.mapWith(Number),
      })
      .from(collection)
      .innerJoin(user, eq(user.id, collection.ownerId))
      .where(
        and(
          sql`${collection.suspendedAt} is null`,
          or(sql`${user.banned} is null`, eq(user.banned, false)),
          eq(collection.indexAccess, "open"),
          eq(collection.indexable, true),
          or(ilike(collection.name, like), ilike(collection.description, like)),
        ),
      )
      .orderBy(sql`(${collection.name} ilike ${like}) desc`, collection.name)
      .limit(limit),
  ]);
  return [
    ...graphs.map((g): PlaceResult => ({ kind: "graph", name: g.name, href: graphPath(g.name), description: g.description, pages: g.pages })),
    ...collections.map(
      (c): PlaceResult => ({ kind: "collection", name: c.name, href: collectionPath(c.slug), description: c.description, pages: c.pages }),
    ),
  ];
}
