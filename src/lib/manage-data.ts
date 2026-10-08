import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { collection, collectionEntry, type EntryListing, graph, publication, type ViewsMode } from "@/db/schema";
import { discoverBlocked } from "@/lib/dashboard-filters";
import { canManageEntry, collectionsOf } from "./collections";
import { canManage, graphsOf } from "./graph-access";
import { entryPath, publicationPath } from "./publications";
import type { PlaceState } from "@/components/manage/place-access-form";

/** What a graph or collection gives a page that doesn't choose for itself, or starts it with. */
export type ContainerDefaults = {
  label: string;
  defaultAccess: "open" | "password" | "members";
  /** Where its new pages are listed: a graph's always start unlisted. */
  defaultListing: EntryListing;
  hasPassword: boolean;
  showAuthors: boolean;
  views: ViewsMode;
  showViewCountries: boolean;
  /** Why roam.pub search skips every page here, whatever the page chooses, if it does. */
  searchBlocked?: string;
  /** Its Listed pages may show in roam.pub search (Discoverable ones always do). */
  searchListed: boolean;
};

/** Why roam.pub search skips a graph's or collection's pages, if it does. Mirrors lib/site-search.ts. */
function searchBlocked(label: string, c: { suspendedAt: Date | null; indexAccess: string; indexable: boolean; frontPage?: boolean }) {
  return c.suspendedAt
    ? `${label} is suspended`
    : c.frontPage === false
      ? `${label}'s front page is off`
      : c.indexAccess !== "open"
        ? `${label}'s page is protected`
        : !c.indexable
          ? `search engines are off for ${label}`
          : undefined;
}

/** Everything the Manage dialog needs for one page, as plain data for a client component. */
export type ManageData = {
  publicationId: string;
  title: string;
  /** Encrypted with its passwords (lib/encryption.ts). */
  encrypted: boolean;
  /** How it was encrypted (ENCRYPTION_VERSIONS), and by which extension version when in Roam. */
  encryptionVersion: number | null;
  encryptedBy: string | null;
  /** A password it was encrypted with was reset: some place can't open it until it's republished. */
  needsRepublish: boolean;
  /** Can change the page itself: its graph place, collections, unpublish. */
  canManagePage: boolean;
  /** Shows up in roam.pub site search where it's Listed. Discoverable places always do. */
  searchable: boolean;
  origin: { graphName: string; rootUid: string };
  graphPlace: {
    inGraph: boolean;
    path: string;
    visibility: "public" | "unlisted";
    discoverable: boolean;
    /** The graph's front page lists its pages, and search engines may index them. */
    frontPage: boolean;
    indexable: boolean;
    /** Why the graph can't list pages on Discover right now, if it can't. */
    discoverBlocked?: string;
    state: PlaceState;
    container: ContainerDefaults;
  };
  entries: {
    entryId: string;
    path: string;
    collectionName: string;
    collectionSlug: string;
    canManage: boolean;
    state: PlaceState;
    container: ContainerDefaults & { discoverBlocked?: string };
  }[];
  /** Collections the viewer belongs to that don't have this page yet. */
  addable: { id: string; name: string }[];
  /** The page's tags, and whether each was added on the website. Empty unless `canManagePage`. */
  tags: { name: string; added: boolean }[];
  /** Tags from the Roam text removed on the website. */
  hiddenTags: string[];
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
          views: entry.views,
          showViewCountries: entry.showViewCountries,
          listing: entry.listing,
          encrypted: pub.encrypted,
        },
        container: {
          label: c.name,
          defaultAccess: c.defaultAccess,
          // Mirrors addEntry in lib/collections.ts.
          defaultListing: (c.featured && c.indexAccess === "open" && c.defaultAccess === "open" ? "discover" : "listed") as EntryListing,
          hasPassword: !!c.passwordHash,
          showAuthors: c.showAuthors,
          views: c.views,
          showViewCountries: c.showViewCountries,
          searchBlocked: searchBlocked(c.name, c),
          searchListed: c.searchListed,
          discoverBlocked: c.suspendedAt
            ? "This collection is suspended."
            : c.indexAccess !== "open"
              ? "The collection's page is protected, so its pages can't go on Discover."
              : !c.indexable
                ? "Turn on search engines for the collection to put pages on Discover."
                : undefined,
        },
      }));
    if (!canManagePage && !entries.some((e) => e.canManage)) continue;
    const inIt = new Set(entries.map((e) => e.collectionSlug));
    out.set(pub.id, {
      publicationId: pub.id,
      title: pub.title,
      encrypted: pub.encrypted,
      encryptionVersion: pub.encryptionVersion,
      encryptedBy: pub.encryptedBy,
      needsRepublish: pub.needsRepublish,
      canManagePage,
      searchable: pub.searchable,
      origin: { graphName: g.name, rootUid: pub.rootUid },
      graphPlace: {
        inGraph: pub.inGraph,
        path: publicationPath(g.name, pub.rootUid, pub.title),
        visibility: pub.visibility,
        discoverable: pub.discoverable,
        frontPage: g.frontPage,
        // Search engines only reach a front page anyone can open.
        indexable: g.indexable && g.indexAccess === "open",
        discoverBlocked: discoverBlocked(g),
        state: {
          access: pub.access,
          hasOwnPassword: !!pub.passwordHash,
          showAuthor: pub.showAuthor,
          views: pub.views,
          showViewCountries: pub.showViewCountries,
          encrypted: pub.encrypted,
        },
        container: {
          label: g.name,
          defaultAccess: g.defaultAccess,
          defaultListing: "unlisted",
          hasPassword: !!g.passwordHash,
          showAuthors: g.showAuthors,
          views: g.views,
          showViewCountries: g.showViewCountries,
          searchBlocked: searchBlocked(g.name, g),
          searchListed: g.searchListed,
        },
      },
      entries,
      addable: canManagePage
        ? collections.filter((c) => !c.suspendedAt && !inIt.has(c.slug)).map((c) => ({ id: c.id, name: c.name }))
        : [],
      tags: canManagePage ? pub.tags.map((name) => ({ name, added: pub.tagsAdded.includes(name) })) : [],
      hiddenTags: canManagePage ? pub.tagsHidden : [],
    });
  }
  return out;
}

