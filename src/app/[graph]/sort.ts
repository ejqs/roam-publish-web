export const SORTS = ["updated", "created", "title"] as const;
export type Sort = (typeof SORTS)[number];
export const PAGE_SIZE = 20;

export function parseSort(v: unknown): Sort {
  return SORTS.includes(v as Sort) ? (v as Sort) : "updated";
}

export function parsePage(v: unknown) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

/** Default params are left out so the canonical URL stays bare. */
export function listHref(path: string, sort: Sort, page: number) {
  const q = new URLSearchParams();
  if (sort !== "updated") q.set("sort", sort);
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
