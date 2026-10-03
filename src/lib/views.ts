import type { PlaceViews, ShowAuthor, ViewCountry, ViewsMode } from "@/db/schema";

/** Below this, visitors see "< 10 views" instead of the number, and no countries are looked up. */
export const MIN_SHOWN_VIEWS = 10;
/** Countries with fewer views fold into "other", so a small page can't single out one reader. */
export const MIN_COUNTRY_VIEWS = 3;
/** Countries kept per page; the footer shows the first few as flags. */
export const TOP_COUNTRIES = 10;
export const FOOTER_FLAGS = 3;

/**
 * Who sees a page's view count: everyone ("show"), only the people who manage it ("hide"), or nobody,
 * and it isn't tracked ("off"). Listed pages follow their graph or collection unless they override
 * it; an unlisted page is public only when the page itself is set to show.
 */
export function viewsMode(c: { views: ViewsMode }, p: { views: PlaceViews }, listed: boolean): ViewsMode {
  if (p.views !== "inherit") return p.views;
  if (c.views === "off") return "off";
  return listed ? c.views : "hide";
}

/** Whether a public view count also shows reader countries. */
export const showsViewCountries = (c: { showViewCountries: boolean }, p: { showViewCountries: ShowAuthor }) =>
  p.showViewCountries === "inherit" ? c.showViewCountries : p.showViewCountries === "show";

/** "999", "1k", "1.4k", "12k", "1.3M": exact below a thousand, one decimal below ten of a unit. */
export function formatViews(n: number) {
  if (n < 1000) return String(n);
  const [unit, div] = n < 999_500 ? ["k", 1000] : n < 999_500_000 ? ["M", 1_000_000] : ["B", 1_000_000_000];
  const v = n / div;
  const s = v < 9.95 ? (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, "") : String(Math.round(v));
  return s + unit;
}

const names = new Intl.DisplayNames(["en"], { type: "region" });

/** English name of an ISO country code, or "Other". */
export function countryName(code: string) {
  if (code === "other") return "Other";
  try {
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Turns Umami's country breakdown into what a page stores: the top countries with enough views,
 * most first, and everything else as "other".
 */
export function foldCountries(rows: { x: string | null; y: number }[]): ViewCountry[] {
  const byCode = new Map<string, number>();
  let other = 0;
  for (const { x, y } of rows) {
    const code = x?.trim().toUpperCase();
    if (code && /^[A-Z]{2}$/.test(code)) byCode.set(code, (byCode.get(code) ?? 0) + y);
    else other += y;
  }
  const sorted = [...byCode].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const kept: ViewCountry[] = [];
  for (const [code, views] of sorted) {
    if (views >= MIN_COUNTRY_VIEWS && kept.length < TOP_COUNTRIES) kept.push({ code, views });
    else other += views;
  }
  if (other > 0) kept.push({ code: "other", views: other });
  return kept;
}

/** What a page's footer gets: both sources, and countries when they're shown. */
export type PageViewCounts = {
  /** Visits Umami recorded. */
  umami: number;
  /** Signed-in Roam readers (publication_view). */
  roam: number;
  countries: ViewCountry[] | null;
  syncedAt: Date | null;
};

/** The one number the footer shows. Ad blockers hide some visits from Umami, so neither always wins. */
export const totalViews = (v: Pick<PageViewCounts, "umami" | "roam">) => Math.max(v.umami, v.roam);
