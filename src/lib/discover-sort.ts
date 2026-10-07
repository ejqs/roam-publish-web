export const DISCOVER_SORTS = ["recent", "trending", "top"] as const;
export type DiscoverSort = (typeof DISCOVER_SORTS)[number];

export const PAGE_SIZE = 20;

export function parseSort(v: unknown): DiscoverSort {
  return DISCOVER_SORTS.includes(v as DiscoverSort) ? (v as DiscoverSort) : "recent";
}

export function parsePage(v: unknown) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** Default params are left out so the canonical URL stays bare. */
export function listHref(sort: DiscoverSort, page: number) {
  const q = new URLSearchParams();
  if (sort !== "recent") q.set("sort", sort);
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `/discover?${s}` : "/discover";
}
