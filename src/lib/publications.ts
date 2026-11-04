import { slugify } from "./slug";

export function graphPath(graphName: string) {
  return `/${encodeURIComponent(graphName)}`;
}

/** Path is keyed by the Roam uid; the trailing slug is decorative and never read. */
export function publicationPath(graphName: string, rootUid: string, title: string) {
  return `/${encodeURIComponent(graphName)}/${encodeURIComponent(rootUid)}/${slugify(title)}`;
}

export function publicationUrl(graphName: string, rootUid: string, title: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return base + publicationPath(graphName, rootUid, title);
}

/** An Unlisted page in its graph: a random id and the title, so the address doesn't name the graph. */
export function linkPath(linkId: string, title: string) {
  return `/l/${encodeURIComponent(linkId)}/${slugify(title)}`;
}

/** Where a page lives in its graph: its graph address while Public, its /l/ address while Unlisted. */
export function placePath(graphName: string, p: { rootUid: string; title: string; visibility: "public" | "unlisted"; linkId: string }) {
  return p.visibility === "unlisted" ? linkPath(p.linkId, p.title) : publicationPath(graphName, p.rootUid, p.title);
}

export function placeUrl(...args: Parameters<typeof placePath>) {
  return appUrl(placePath(...args));
}

const appUrl = (path: string) => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000") + path;

export function collectionPath(slug: string) {
  return `/c/${encodeURIComponent(slug)}`;
}

/**
 * A page in a collection: the collection, the entry's own random uid, then the same decorative
 * slug as graph pages. /c/{entryUid}/… links from before still redirect here.
 */
export function entryPath(collectionSlug: string, entryUid: string, title: string) {
  return `${collectionPath(collectionSlug)}/${encodeURIComponent(entryUid)}/${slugify(title)}`;
}

/**
 * Where a page lives in a collection. Unlisted pages leave out the collection, /c/{entryUid}/{title},
 * so their address doesn't name it; the others are /c/{collection}/{entryUid}/{title}.
 */
export function entryPlacePath(collectionSlug: string, entry: { entryUid: string; listing: string }, title: string) {
  return entry.listing === "unlisted"
    ? `${collectionPath(entry.entryUid)}/${slugify(title)}`
    : entryPath(collectionSlug, entry.entryUid, title);
}

export function entryPlaceUrl(...args: Parameters<typeof entryPlacePath>) {
  return appUrl(entryPlacePath(...args));
}

export function entryUrl(collectionSlug: string, entryUid: string, title: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return base + entryPath(collectionSlug, entryUid, title);
}

export function collectionUrl(slug: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return base + collectionPath(slug);
}

/** Where a bullet leads: the same page, zoomed into that block (`?block=`), like Roam. */
export const zoomHref = (uid: string) => `?block=${encodeURIComponent(uid)}`;

/** The block a published page is zoomed into, from its search params. */
export const zoomParam = (search?: Record<string, string | string[] | undefined>) =>
  typeof search?.block === "string" ? search.block : undefined;
