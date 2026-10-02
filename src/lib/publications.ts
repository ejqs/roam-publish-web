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

export function entryUrl(collectionSlug: string, entryUid: string, title: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return base + entryPath(collectionSlug, entryUid, title);
}

export function collectionUrl(slug: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return base + collectionPath(slug);
}
