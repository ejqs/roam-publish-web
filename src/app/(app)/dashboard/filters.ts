import { and, asc, desc, eq, ilike, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { publication } from "@/db/schema";

/** The settings a page can be in, as the access menu names them, plus moderator removal. */
export const ACCESS = ["unlisted", "public", "discover", "removed"] as const;
export type AccessFilter = (typeof ACCESS)[number];
export const ACCESS_LABELS: Record<AccessFilter, string> = {
  unlisted: "Unlisted",
  public: "Public",
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

export const SORTS = ["updated", "created", "title"] as const;
export type Sort = (typeof SORTS)[number];
export const SORT_LABELS: Record<Sort, string> = { updated: "Updated", created: "Created", title: "Title" };
/** Dates read newest first by default, titles A–Z. */
const DEFAULT_DESC: Record<Sort, boolean> = { updated: true, created: true, title: false };

export const PAGE_SIZE = 25;

export type ListState = {
  access: AccessFilter | null;
  kind: KindFilter | null;
  q: string;
  sort: Sort;
  desc: boolean;
  page: number;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const pick = <T extends string>(list: readonly T[], v: unknown) => (list.includes(v as T) ? (v as T) : null);

export function parseListState(search: Record<string, string | string[] | undefined>): ListState {
  const sort = pick(SORTS, one(search.sort)) ?? "updated";
  const dir = one(search.dir);
  const n = Number(one(search.page));
  return {
    access: pick(ACCESS, one(search.access)),
    kind: pick(KINDS, one(search.kind)),
    q: (one(search.q) ?? "").trim().slice(0, 200),
    sort,
    desc: dir === "asc" ? false : dir === "desc" ? true : DEFAULT_DESC[sort],
    page: Number.isInteger(n) && n > 0 ? n : 1,
  };
}

/** Default params are left out so URLs stay short. Changing anything but the page goes back to page 1. */
export function listHref(path: string, state: ListState, change: Partial<ListState> = {}) {
  const s = { ...state, page: 1, ...change };
  const q = new URLSearchParams();
  if (s.q) q.set("q", s.q);
  if (s.access) q.set("access", s.access);
  if (s.kind) q.set("kind", s.kind);
  if (s.sort !== "updated") q.set("sort", s.sort);
  if (s.desc !== DEFAULT_DESC[s.sort]) q.set("dir", s.desc ? "desc" : "asc");
  if (s.page > 1) q.set("page", String(s.page));
  const str = q.toString();
  return str ? `${path}?${str}` : path;
}

/** Clicking the current sort flips it; clicking another starts at that column's default direction. */
export function sortHref(path: string, state: ListState, sort: Sort) {
  return listHref(path, state, { sort, desc: sort === state.sort ? !state.desc : DEFAULT_DESC[sort] });
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function listWhere(graphId: string, s: ListState) {
  return and(
    eq(publication.graphId, graphId),
    s.access ? ACCESS_WHERE[s.access] : undefined,
    s.kind ? eq(publication.kind, s.kind) : undefined,
    s.q ? ilike(publication.title, `%${escapeLike(s.q)}%`) : undefined,
  );
}

export function listOrder(s: ListState) {
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
