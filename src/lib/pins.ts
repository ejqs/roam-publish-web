import "server-only";
import { eq, inArray, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { collection, collectionEntry, graph, linkPin, publication } from "@/db/schema";
import {
  collectionPageLink,
  frontPageLink,
  type Pin,
  type PinTarget,
  pinBlocked,
  placeLink,
  sharedAtText,
} from "./pin-rules";

/**
 * Pinned links (pin-rules.ts says what a pin refuses). These look pins up for the server actions and
 * routes that could break a link, so a pin protects it whatever asks: the dashboard, the Manage dialog,
 * bulk actions or the extension, any version of it.
 */


const where = (t: PinTarget): SQL =>
  t.kind === "page"
    ? eq(linkPin.publicationId, t.publicationId)
    : t.kind === "entry"
      ? eq(linkPin.entryId, t.entryId)
      : t.kind === "front"
        ? eq(linkPin.graphId, t.graphId)
        : eq(linkPin.collectionId, t.collectionId);

/** The pin on one link, if it has one. */
export async function pinOf(t: PinTarget): Promise<Pin | null> {
  const [row] = await db.select({ sharedAt: linkPin.sharedAt }).from(linkPin).where(where(t)).limit(1);
  return row ?? null;
}

/** Pins on pages' graph links, by publication id. */
export async function pagePins(publicationIds: string[]): Promise<Map<string, Pin>> {
  if (publicationIds.length === 0) return new Map();
  const rows = await db
    .select({ id: linkPin.publicationId, sharedAt: linkPin.sharedAt })
    .from(linkPin)
    .where(inArray(linkPin.publicationId, publicationIds));
  return new Map(rows.map((r) => [r.id!, { sharedAt: r.sharedAt }]));
}

/** Pins on collection entries' links, by entry id. */
export async function entryPins(entryIds: string[]): Promise<Map<string, Pin>> {
  if (entryIds.length === 0) return new Map();
  const rows = await db
    .select({ id: linkPin.entryId, sharedAt: linkPin.sharedAt })
    .from(linkPin)
    .where(inArray(linkPin.entryId, entryIds));
  return new Map(rows.map((r) => [r.id!, { sharedAt: r.sharedAt }]));
}

/**
 * Why a page can't be unpublished: the first of its links that's pinned (in its graph, then in each
 * collection), in the words of that link. Undefined when none is.
 */
export async function unpublishBlocked(pub: { id: string; graphName: string }) {
  const [own] = await db.select({ sharedAt: linkPin.sharedAt }).from(linkPin).where(eq(linkPin.publicationId, pub.id)).limit(1);
  if (own) return pinBlocked(placeLink(pub.graphName), own);
  const [entry] = await db
    .select({ sharedAt: linkPin.sharedAt, name: collection.name })
    .from(linkPin)
    .innerJoin(collectionEntry, eq(collectionEntry.id, linkPin.entryId))
    .innerJoin(collection, eq(collection.id, collectionEntry.collectionId))
    .where(eq(collectionEntry.publicationId, pub.id))
    .limit(1);
  if (entry) return pinBlocked(placeLink(entry.name), entry);
}

/** Of these pages, the ones with any pinned link, so bulk unpublish can skip them. */
export async function pinnedPages(publicationIds: string[]): Promise<Set<string>> {
  if (publicationIds.length === 0) return new Set();
  const own = await db
    .select({ id: linkPin.publicationId })
    .from(linkPin)
    .where(inArray(linkPin.publicationId, publicationIds));
  const viaEntries = await db
    .select({ id: collectionEntry.publicationId })
    .from(linkPin)
    .innerJoin(collectionEntry, eq(collectionEntry.id, linkPin.entryId))
    .where(inArray(collectionEntry.publicationId, publicationIds));
  return new Set([...own, ...viaEntries].map((r) => r.id!));
}

/**
 * Why a graph can't be deleted: its front page, or a page's link in it or in a collection, is pinned.
 * Deleting it would take every one of them down.
 */
export async function deleteGraphBlocked(g: { id: string; name: string }) {
  const [front] = await db.select({ sharedAt: linkPin.sharedAt }).from(linkPin).where(eq(linkPin.graphId, g.id)).limit(1);
  if (front) return pinBlocked(frontPageLink(g.name), front);
  const [own] = await db
    .select({ sharedAt: linkPin.sharedAt, title: publication.title })
    .from(linkPin)
    .innerJoin(publication, eq(publication.id, linkPin.publicationId))
    .where(eq(publication.graphId, g.id))
    .limit(1);
  const [inCollection] = own
    ? []
    : await db
        .select({ sharedAt: linkPin.sharedAt, title: publication.title })
        .from(linkPin)
        .innerJoin(collectionEntry, eq(collectionEntry.id, linkPin.entryId))
        .innerJoin(publication, eq(publication.id, collectionEntry.publicationId))
        .where(eq(publication.graphId, g.id))
        .limit(1);
  const page = own ?? inCollection;
  if (page) return `A link to "${page.title}" is pinned because you shared it at ${sharedAtText(page)}. Unpin it first.`;
}

/** Why a collection can't be deleted: its page, or a page's link in it, is pinned. */
export async function deleteCollectionBlocked(c: { id: string; name: string }) {
  const [own] = await db.select({ sharedAt: linkPin.sharedAt }).from(linkPin).where(eq(linkPin.collectionId, c.id)).limit(1);
  if (own) return pinBlocked(collectionPageLink(c.name), own);
  const [entry] = await db
    .select({ sharedAt: linkPin.sharedAt, title: publication.title })
    .from(linkPin)
    .innerJoin(collectionEntry, eq(collectionEntry.id, linkPin.entryId))
    .innerJoin(publication, eq(publication.id, collectionEntry.publicationId))
    .where(eq(collectionEntry.collectionId, c.id))
    .limit(1);
  if (entry) return `The link to "${entry.title}" in ${c.name} is pinned because you shared it at ${sharedAtText(entry)}. Unpin it first.`;
}

/**
 * Pinned pages in a graph or collection that read with its own password (no password of their own),
 * so changing or removing that password would lock out the people they were shared with.
 */
export async function containerPasswordBlocked(kind: "graph" | "collection", id: string, label: string) {
  if (kind === "graph") {
    const [g] = await db.select({ defaultAccess: graph.defaultAccess }).from(graph).where(eq(graph.id, id));
    const rows = await db
      .select({ sharedAt: linkPin.sharedAt, access: publication.access, own: publication.passwordHash, inGraph: publication.inGraph })
      .from(linkPin)
      .innerJoin(publication, eq(publication.id, linkPin.publicationId))
      .where(eq(publication.graphId, id));
    const hit = rows.find((r) => r.inGraph && !r.own && (r.access === "inherit" ? g?.defaultAccess : r.access) === "password");
    if (hit) return `A Password page's link in ${label} is pinned because you shared it at ${sharedAtText(hit)}, and it uses the ${label} password. Unpin it first.`;
    return;
  }
  const [c] = await db.select({ defaultAccess: collection.defaultAccess }).from(collection).where(eq(collection.id, id));
  const rows = await db
    .select({ sharedAt: linkPin.sharedAt, access: collectionEntry.access, own: collectionEntry.passwordHash })
    .from(linkPin)
    .innerJoin(collectionEntry, eq(collectionEntry.id, linkPin.entryId))
    .where(eq(collectionEntry.collectionId, id));
  const hit = rows.find((r) => !r.own && (r.access === "inherit" ? c?.defaultAccess : r.access) === "password");
  if (hit) return `A Password page's link in ${label} is pinned because you shared it at ${sharedAtText(hit)}, and it uses the ${label} password. Unpin it first.`;
}
