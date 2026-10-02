import { normalizeTag } from "./tags";

/**
 * A public page list's URL state: search, tags, type, sort and page. The URL is the state, so every
 * filtered view is a link and works without JavaScript.
 */

export const LIST_PAGE_SIZE = 20;
export const MAX_FILTER_TAGS = 5;
export const KINDS = ["page", "block"] as const;
export type Kind = (typeof KINDS)[number];

export type ListConfig<S extends string> = {
  sorts: readonly S[];
  sortLabels: Record<S | "relevance", string>;
  /** Without a search. With one, the default is relevance. */
  defaultSort: S;
};

export type ListState<S extends string> = {
  q: string;
  tags: string[];
  kind: Kind | null;
  sort: S | "relevance";
  page: number;
};

export const GRAPH_SORTS = ["updated", "created", "title"] as const;
export type GraphSort = (typeof GRAPH_SORTS)[number];
export const GRAPH_LIST: ListConfig<GraphSort> = {
  sorts: GRAPH_SORTS,
  sortLabels: { updated: "Updated", created: "Created", title: "A–Z", relevance: "Relevance" },
  defaultSort: "updated",
};

export const COLLECTION_SORTS = ["order", "added", "updated", "title"] as const;
export type CollectionSort = (typeof COLLECTION_SORTS)[number];
export const COLLECTION_LIST: ListConfig<CollectionSort> = {
  sorts: COLLECTION_SORTS,
  sortLabels: { order: "Collection order", added: "Added", updated: "Updated", title: "A–Z", relevance: "Relevance" },
  defaultSort: "order",
};

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const all = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

const defaultSortOf = <S extends string>(cfg: ListConfig<S>, q: string) => (q ? "relevance" : cfg.defaultSort);

export function parseListState<S extends string>(cfg: ListConfig<S>, search: Search): ListState<S> {
  const q = (one(search.q) ?? "").trim().slice(0, 200);
  const tags = [...new Set(all(search.tag).map(normalizeTag).filter((t): t is string => !!t))].slice(0, MAX_FILTER_TAGS);
  const kind = KINDS.includes(one(search.kind) as Kind) ? (one(search.kind) as Kind) : null;
  const rawSort = one(search.sort);
  const sort =
    cfg.sorts.includes(rawSort as S) || (rawSort === "relevance" && q) ? (rawSort as S | "relevance") : defaultSortOf(cfg, q);
  const n = Number(one(search.page));
  return { q, tags, kind, sort, page: Number.isInteger(n) && n > 0 ? n : 1 };
}

/** Default params are left out so URLs stay short. Changing anything but the page goes back to page 1. */
export function listHref<S extends string>(
  cfg: ListConfig<S>,
  path: string,
  state: ListState<S>,
  change: Partial<ListState<S>> = {},
) {
  const s = { ...state, page: 1, ...change };
  // Clearing the search drops a relevance sort with it.
  if (!s.q && s.sort === "relevance") s.sort = cfg.defaultSort;
  const q = new URLSearchParams();
  if (s.q) q.set("q", s.q);
  for (const t of s.tags) q.append("tag", t);
  if (s.kind) q.set("kind", s.kind);
  if (s.sort !== defaultSortOf(cfg, s.q)) q.set("sort", s.sort);
  if (s.page > 1) q.set("page", String(s.page));
  const str = q.toString();
  return str ? `${path}?${str}` : path;
}

export const isFiltered = (s: ListState<string>) => !!s.q || s.tags.length > 0 || !!s.kind;

/** Adds the tag, or takes it away when it's already there. */
export const toggleTag = (tags: string[], t: string) =>
  tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t].slice(-MAX_FILTER_TAGS);
