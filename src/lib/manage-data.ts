import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { collection, collectionEntry, graph, publication } from "@/db/schema";
import { canManageEntry, collectionsOf } from "./collections";
import { canManage, graphsOf } from "./graph-access";
import { entryPath, publicationPath } from "./publications";
import type { PlaceState } from "@/components/manage/place-access-form";

/** Everything the Manage dialog needs for one page, as plain data for a client component. */
export type ManageData = {
  publicationId: string;
  title: string;
  /** Can change the page itself: its graph place, collections, unpublish. */
  canManagePage: boolean;
  origin: { graphName: string; rootUid: string };
  graphPlace: {
    inGraph: boolean;
    path: string;
    visibility: "public" | "unlisted";
    discoverable: boolean;
    state: PlaceState;
    container: { label: string; defaultAccess: "open" | "password" | "members"; hasPassword: boolean; showAuthors: boolean };
  };
  entries: {
    entryId: string;
    path: string;
    collectionName: string;
    collectionSlug: string;
    canManage: boolean;
    state: PlaceState;
    container: {
      label: string;
      defaultAccess: "open" | "password" | "members";
      hasPassword: boolean;
      showAuthors: boolean;
      discoverBlocked?: string;
    };
  }[];
  /** Collections the viewer belongs to that don't have this page yet. */
  addable: { id: string; name: string }[];
};

/**
 * Manage data for pages the viewer can manage, or whose collection entries they can manage.
 * Pages the viewer has no say over are left out.
 */
export async function manageDataFor(userId: string, publicationIds: string[]): Promise<Map<string, ManageData>> {
  const out = new Map<string, ManageData>();
  if (publicationIds.length === 0) return out;
  const [graphs, collections, rows, entryRows] = await Promise.all([
    graphsOf(userId),
    collectionsOf(userId),
    db
      .select({ pub: publication, g: graph })
      .from(publication)
      .innerJoin(graph, eq(graph.id, publication.graphId))
      .where(inArray(publication.id, publicationIds)),
    db
      .select({ entry: collectionEntry, c: collection })
      .from(collectionEntry)
      .innerJoin(collection, eq(collection.id, collectionEntry.collectionId))
      .where(inArray(collectionEntry.publicationId, publicationIds))
      .orderBy(collection.name),
  ]);
  const roles = new Map(graphs.map((g) => [g.id, g.role]));
  const collectionRoles = new Map(collections.map((c) => [c.id, c.role]));

  for (const { pub, g } of rows) {
    const canManagePage = canManage(roles.get(g.id) ?? null, userId, pub);
    const entries = entryRows
      .filter((e) => e.entry.publicationId === pub.id)
      .map(({ entry, c }) => ({
        entryId: entry.id,
        path: entryPath(c.slug, entry.entryUid, pub.title),
        collectionName: c.name,
        collectionSlug: c.slug,
        canManage: !pub.removedAt && canManageEntry(collectionRoles.get(c.id) ?? null, userId, entry),
        state: {
          access: entry.access,
          hasOwnPassword: !!entry.passwordHash,
          showAuthor: entry.showAuthor,
          listing: entry.listing,
        },
        container: {
          label: c.name,
          defaultAccess: c.defaultAccess,
          hasPassword: !!c.passwordHash,
          showAuthors: c.showAuthors,
          discoverBlocked: c.suspendedAt
            ? "This collection is suspended."
            : c.indexAccess !== "open"
              ? "The collection's page is protected, so it can't list pages on Discover."
              : !c.indexable
                ? "Turn on search engines for the collection to use Discover."
                : undefined,
        },
      }));
    if (!canManagePage && !entries.some((e) => e.canManage)) continue;
    const inIt = new Set(entries.map((e) => e.collectionSlug));
    out.set(pub.id, {
      publicationId: pub.id,
      title: pub.title,
      canManagePage,
      origin: { graphName: g.name, rootUid: pub.rootUid },
      graphPlace: {
        inGraph: pub.inGraph,
        path: publicationPath(g.name, pub.rootUid, pub.title),
        visibility: pub.visibility,
        discoverable: pub.discoverable,
        state: { access: pub.access, hasOwnPassword: !!pub.passwordHash, showAuthor: pub.showAuthor },
        container: {
          label: g.name,
          defaultAccess: g.defaultAccess,
          hasPassword: !!g.passwordHash,
          showAuthors: g.showAuthors,
        },
      },
      entries,
      addable: canManagePage
        ? collections.filter((c) => !c.suspendedAt && !inIt.has(c.slug)).map((c) => ({ id: c.id, name: c.name }))
        : [],
    });
  }
  return out;
}

