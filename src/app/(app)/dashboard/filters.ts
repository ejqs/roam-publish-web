import { and, asc, desc, eq, ilike, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { collectionEntry, publication } from "@/db/schema";

/** The settings a page can be in, as the access menu names them, plus moderator removal. */
export const ACCESS = ["unlisted", "public", "discover", "removed"] as const;
export type AccessFilter = (typeof ACCESS)[number];
export const ACCESS_LABELS: Record<AccessFilter, string> = {
  unlisted: "Not listed",
  public: "Listed",
  discover: "Discover",
  removed: "Removed",
};

export const ACCESS_WHERE: Record<AccessFilter, SQL> = {
  unlisted: and(isNull(publication.removedAt), eq(publication.visibility, "unlisted"))!,
  public: and(
    isNull(publication.removedAt),
    eq(publication.visibility, "public"),
    eq(publication.discoverable, false),
  )!,
  discover: and(
    isNull(publication.removedAt),
    eq(publication.visibility, "public"),
    eq(publication.discoverable, true),
  )!,
  removed: isNotNull(publication.removedAt),
};

/** Per-setting counts, for a select grouped by graph. */
const countWhere = (a: AccessFilter) => sql<number>`count(*) filter (where ${ACCESS_WHERE[a]})`.mapWith(Number);
export const accessCounts = {
  unlisted: countWhere("unlisted"),
  public: countWhere("public"),
  discover: countWhere("discover"),
  removed: countWhere("removed"),
};
export type AccessCounts = Record<AccessFilter, number>;

export const KINDS = ["page", "block"] as const;
export type KindFilter = (typeof KINDS)[number];

export const PAGE_SIZE = 25;

/**
 * A dashboard page list's URL state: one filter on where pages are listed (`access`, the param name
 * graphs have always used), a type filter, a title search, a sort and a page number. Graph and
 * collection lists differ only in their filter and sort options.
 */
export type ListConfig<F extends string, S extends string> = {
  filters: readonly F[];
  filterLabels: Record<F, string>;
  sorts: readonly S[];
  sortLabels: Record<S, string>;
  defaultSort: S;
  /** Dates read newest first by default, titles A–Z. */
  defaultDesc: Record<S, boolean>;
};

export type ListState<F extends string, S extends string> = {
  access: F | null;
  kind: KindFilter | null;
  q: string;
  sort: S;
  desc: boolean;
  page: number;
};

export const SORTS = ["updated", "created", "title"] as const;
export type Sort = (typeof SORTS)[number];

export const GRAPH_LIST: ListConfig<AccessFilter, Sort> = {
  filters: ACCESS,
  filterLabels: ACCESS_LABELS,
  sorts: SORTS,
  sortLabels: { updated: "Updated", created: "Created", title: "Title" },
  defaultSort: "updated",
  defaultDesc: { updated: true, created: true, title: false },
};
export type GraphListState = ListState<AccessFilter, Sort>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const pick = <T extends string>(list: readonly T[], v: unknown) => (list.includes(v as T) ? (v as T) : null);

export function parseListState<F extends string, S extends string>(
  cfg: ListConfig<F, S>,
  search: Record<string, string | string[] | undefined>,
): ListState<F, S> {
  const sort = pick(cfg.sorts, one(search.sort)) ?? cfg.defaultSort;
  const dir = one(search.dir);
  const n = Number(one(search.page));
  return {
    access: pick(cfg.filters, one(search.access)),
    kind: pick(KINDS, one(search.kind)),
    q: (one(search.q) ?? "").trim().slice(0, 200),
    sort,
    desc: dir === "asc" ? false : dir === "desc" ? true : cfg.defaultDesc[sort],
    page: Number.isInteger(n) && n > 0 ? n : 1,
  };
}

/** Default params are left out so URLs stay short. Changing anything but the page goes back to page 1. */
export function listHref<F extends string, S extends string>(
  cfg: ListConfig<F, S>,
  path: string,
  state: ListState<F, S>,
  change: Partial<ListState<F, S>> = {},
) {
  const s = { ...state, page: 1, ...change };
  const q = new URLSearchParams();
  if (s.q) q.set("q", s.q);
  if (s.access) q.set("access", s.access);
  if (s.kind) q.set("kind", s.kind);
  if (s.sort !== cfg.defaultSort) q.set("sort", s.sort);
  if (s.desc !== cfg.defaultDesc[s.sort]) q.set("dir", s.desc ? "desc" : "asc");
  if (s.page > 1) q.set("page", String(s.page));
  const str = q.toString();
  return str ? `${path}?${str}` : path;
}

/** Clicking the current sort flips it; clicking another starts at that column's default direction. */
export function sortHref<F extends string, S extends string>(
  cfg: ListConfig<F, S>,
  path: string,
  state: ListState<F, S>,
  sort: S,
) {
  return listHref(cfg, path, state, { sort, desc: sort === state.sort ? !state.desc : cfg.defaultDesc[sort] });
}

export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function listWhere(graphId: string, s: GraphListState) {
  return and(
    eq(publication.graphId, graphId),
    s.access ? ACCESS_WHERE[s.access] : undefined,
    s.kind ? eq(publication.kind, s.kind) : undefined,
    s.q ? ilike(publication.title, `%${escapeLike(s.q)}%`) : undefined,
  );
}

export function listOrder(s: GraphListState) {
  const dir = s.desc ? desc : asc;
  if (s.sort === "title") return [dir(sql`lower(${publication.title})`), dir(publication.title), asc(publication.id)];
  return [dir(s.sort === "created" ? publication.createdAt : publication.updatedAt), asc(publication.id)];
}

/** The owner's list of a graph's published pages. */
export const graphPagesPath = (graphName: string) => `/dashboard/${encodeURIComponent(graphName)}`;

/** Why a graph can't list pages on Discover right now, if it can't. */
export function discoverBlocked(g: {
  suspendedAt: Date | null;
  frontPage: boolean;
  indexable: boolean;
  indexAccess: string;
}) {
  return g.suspendedAt
    ? "This graph is suspended."
    : g.indexAccess !== "open"
      ? "This graph's front page is protected, so its pages can't go on Discover."
      : !g.frontPage
      ? "Turn on this graph's front page in Settings to use Discover."
      : !g.indexable
        ? "Turn on search engines in Settings to use Discover."
        : undefined;
}

// --- Collection page lists ----------------------------------------------------------------------

export const ENTRY_FILTERS = ["unlisted", "listed", "discover", "removed"] as const;
export type EntryFilter = (typeof ENTRY_FILTERS)[number];
export const ENTRY_SORTS = ["order", "added", "updated", "title"] as const;
export type EntrySort = (typeof ENTRY_SORTS)[number];

export const COLLECTION_LIST: ListConfig<EntryFilter, EntrySort> = {
  filters: ENTRY_FILTERS,
  filterLabels: { unlisted: "Not listed", listed: "Listed", discover: "Discover", removed: "Removed" },
  sorts: ENTRY_SORTS,
  sortLabels: { order: "Order", added: "Added", updated: "Updated", title: "Title" },
  // The owner's order is what visitors see, so it's the default here.
  defaultSort: "order",
  defaultDesc: { order: false, added: true, updated: true, title: false },
};
export type CollectionListState = ListState<EntryFilter, EntrySort>;

const ENTRY_WHERE: Record<EntryFilter, SQL> = {
  unlisted: and(isNull(publication.removedAt), eq(collectionEntry.listing, "unlisted"))!,
  listed: and(isNull(publication.removedAt), eq(collectionEntry.listing, "listed"))!,
  discover: and(isNull(publication.removedAt), eq(collectionEntry.listing, "discover"))!,
  removed: isNotNull(publication.removedAt),
};

const entryCountWhere = (f: EntryFilter) => sql<number>`count(*) filter (where ${ENTRY_WHERE[f]})`.mapWith(Number);
/** Per-listing counts for a select over collection_entry joined to publication. */
export const entryCounts = {
  unlisted: entryCountWhere("unlisted"),
  listed: entryCountWhere("listed"),
  discover: entryCountWhere("discover"),
  removed: entryCountWhere("removed"),
};

/** Needs publication joined. */
export function entryListWhere(collectionId: string, s: CollectionListState) {
  return and(
    eq(collectionEntry.collectionId, collectionId),
    s.access ? ENTRY_WHERE[s.access] : undefined,
    s.kind ? eq(publication.kind, s.kind) : undefined,
    s.q ? ilike(publication.title, `%${escapeLike(s.q)}%`) : undefined,
  );
}

export function entryListOrder(s: CollectionListState) {
  const dir = s.desc ? desc : asc;
  if (s.sort === "title") return [dir(sql`lower(${publication.title})`), dir(publication.title), asc(collectionEntry.id)];
  if (s.sort === "updated") return [dir(publication.updatedAt), asc(collectionEntry.id)];
  if (s.sort === "added") return [dir(collectionEntry.addedAt), asc(collectionEntry.id)];
  return [dir(collectionEntry.position), dir(collectionEntry.addedAt), asc(collectionEntry.id)];
}

/** A collection's page list on the dashboard. */
export const collectionPagesPath = (slug: string) => `/dashboard/collections/${encodeURIComponent(slug)}`;
