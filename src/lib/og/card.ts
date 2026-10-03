import type { Access, publication } from "@/db/schema";
import { DESCRIPTION, excerpt, linkedPages, type PreviewCard, readMinutes } from "@/lib/link-preview";
import { plainText } from "@/lib/slug";
import { bylineFor } from "@/lib/viewer";

/**
 * The card for a page in one place (its graph, or a collection). Only open, unencrypted pages show
 * their title and text: the rest name only their graph or collection.
 */
export async function cardFor(
  pub: typeof publication.$inferSelect,
  { container, access, showAuthor }: { container: string; access: Access; showAuthor: boolean },
): Promise<PreviewCard> {
  if (access !== "open" || pub.encrypted) return { locked: true, container };
  const byline = await bylineFor(pub, showAuthor);
  return {
    locked: false,
    container,
    title: plainText(pub.title) || "Untitled",
    description: excerpt(pub.tree, DESCRIPTION),
    author: byline?.label ?? null,
    tags: pub.tags.slice(0, 3),
    minutes: readMinutes(pub.searchText),
    links: linkedPages(pub.tree, pub.title),
    publishedAt: pub.createdAt.toISOString(),
    updatedAt: pub.updatedAt.toISOString(),
  };
}

export const pageCardPath = (graphName: string, rootUid: string, v: string) =>
  `/api/og/page/${encodeURIComponent(graphName)}/${encodeURIComponent(rootUid)}?v=${v}`;

export const entryCardPath = (entryUid: string, v: string) => `/api/og/entry/${encodeURIComponent(entryUid)}?v=${v}`;
