import "server-only";
import { and, desc, eq, isNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { collection, collectionEntry, graph, publication, user } from "@/db/schema";
import { discoverPublications } from "@/lib/discover";
import { type Container, showsAuthor } from "@/lib/gates";
import type { loadGraph } from "@/lib/graphs";
import { liveGraph, livePublication } from "@/lib/moderation";
import { collectionPath, entryPath, graphPath, publicationPath } from "@/lib/publications";
import { excerpt } from "@/lib/link-preview";
import { plainText } from "@/lib/slug";
import { bylineFor } from "@/lib/viewer";

/**
 * RSS 2.0 feeds for graph front pages, collections and Discover. Feeds are read by aggregators
 * without cookies or sessions, so only pages that are open to everyone are ever included, and a
 * graph or collection only has a feed while its owner turned it on and its front page is open.
 */

const ITEMS = 50;

type Graph = NonNullable<Awaited<ReturnType<typeof loadGraph>>>;
type Collection = typeof collection.$inferSelect & { takenDown: boolean };

export type FeedItem = { title: string; path: string; date: Date; author?: string; description: string; category?: string };
export type Feed = { title: string; path: string; selfPath: string; description: string; items: FeedItem[] };

export const graphFeedPath = (graphName: string) => `${graphPath(graphName)}/feed.xml`;
export const collectionFeedPath = (slug: string) => `${collectionPath(slug)}/feed.xml`;
export const DISCOVER_FEED_PATH = "/discover/feed.xml";

export const hasGraphFeed = (g: Graph) => g.rss && g.frontPage && g.indexAccess === "open" && !g.takenDown;
export const hasCollectionFeed = (c: Collection) => c.rss && c.indexAccess === "open" && !c.takenDown;

/** Open pages on the graph's front page, newest first. */
export async function graphFeed(g: Graph): Promise<Feed> {
  const container: Container = { ...g, kind: "graph" };
  const rows = await db
    .select()
    .from(publication)
    .where(
      and(
        eq(publication.graphId, g.id),
        eq(publication.inGraph, true),
        eq(publication.visibility, "public"),
        livePublication,
        g.defaultAccess === "open"
          ? or(eq(publication.access, "open"), eq(publication.access, "inherit"))
          : eq(publication.access, "open"),
      ),
    )
    .orderBy(desc(publication.createdAt))
    .limit(ITEMS);
  return {
    title: g.name,
    path: graphPath(g.name),
    selfPath: graphFeedPath(g.name),
    description: g.description || `Pages published from ${g.name}.`,
    items: await Promise.all(
      rows.map(async (p) => ({
        title: plainText(p.title),
        path: publicationPath(g.name, p.rootUid, p.title),
        date: p.createdAt,
        author: (await bylineFor(p, showsAuthor(container, p)))?.label,
        description: excerpt(p.tree),
      })),
    ),
  };
}

/** Open, listed pages in the collection, newest additions first. */
export async function collectionFeed(c: Collection): Promise<Feed> {
  const container: Container = { ...c, kind: "collection" };
  const rows = await db
    .select({ entry: collectionEntry, pub: publication })
    .from(collectionEntry)
    .innerJoin(publication, eq(publication.id, collectionEntry.publicationId))
    .innerJoin(graph, eq(graph.id, publication.graphId))
    .innerJoin(user, eq(user.id, graph.userId))
    .where(
      and(
        eq(collectionEntry.collectionId, c.id),
        ne(collectionEntry.listing, "unlisted"),
        c.defaultAccess === "open"
          ? or(eq(collectionEntry.access, "open"), eq(collectionEntry.access, "inherit"))
          : eq(collectionEntry.access, "open"),
        isNull(publication.removedAt),
        liveGraph,
      ),
    )
    .orderBy(desc(collectionEntry.addedAt))
    .limit(ITEMS);
  return {
    title: c.name,
    path: collectionPath(c.slug),
    selfPath: collectionFeedPath(c.slug),
    description: c.description || `Pages in the ${c.name} collection.`,
    items: await Promise.all(
      rows.map(async ({ entry, pub }) => ({
        title: plainText(pub.title),
        path: entryPath(c.slug, entry.entryUid, pub.title),
        date: entry.addedAt,
        author: (await bylineFor(pub, showsAuthor(container, entry)))?.label,
        description: excerpt(pub.tree),
      })),
    ),
  };
}

/** The newest pages on Discover, which only ever lists open pages. */
export async function discoverFeed(): Promise<Feed> {
  const { rows } = await discoverPublications("recent", ITEMS, 0);
  return {
    title: "Discover · Roam Publish",
    path: "/discover",
    selfPath: DISCOVER_FEED_PATH,
    description: "Recently published pages from Roam graphs and collections whose owners opted in.",
    items: rows.map((r) => ({
      title: plainText(r.title),
      path: r.href,
      date: new Date(r.createdAt),
      description: `From ${r.source.label}.`,
      category: r.source.label,
    })),
  };
}

const escape = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Control characters other than tab and newlines aren't allowed in XML 1.0.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

export function rssResponse(feed: Feed) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const updated = feed.items.reduce<Date | null>((d, i) => (!d || i.date > d ? i.date : d), null);
  const items = feed.items.map((i) =>
    [
      "<item>",
      `<title>${escape(i.title || "Untitled")}</title>`,
      `<link>${escape(base + i.path)}</link>`,
      `<guid isPermaLink="true">${escape(base + i.path)}</guid>`,
      `<pubDate>${i.date.toUTCString()}</pubDate>`,
      i.author ? `<dc:creator>${escape(i.author)}</dc:creator>` : "",
      i.category ? `<category>${escape(i.category)}</category>` : "",
      i.description ? `<description>${escape(i.description)}</description>` : "",
      "</item>",
    ].join(""),
  );
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    "<channel>",
    `<title>${escape(feed.title)}</title>`,
    `<link>${escape(base + feed.path)}</link>`,
    `<atom:link href="${escape(base + feed.selfPath)}" rel="self" type="application/rss+xml"/>`,
    `<description>${escape(feed.description)}</description>`,
    updated ? `<lastBuildDate>${updated.toUTCString()}</lastBuildDate>` : "",
    "<generator>Roam Publish</generator>",
    ...items,
    "</channel>",
    "</rss>",
  ].join("\n");
  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
