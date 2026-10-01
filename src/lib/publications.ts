import { slugify } from "./slug";

/** Path is keyed by the Roam uid; the trailing slug is decorative and never read. */
export function publicationPath(graphName: string, rootUid: string, title: string) {
  return `/${encodeURIComponent(graphName)}/${encodeURIComponent(rootUid)}/${slugify(title)}`;
}

export function publicationUrl(graphName: string, rootUid: string, title: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return base + publicationPath(graphName, rootUid, title);
}
