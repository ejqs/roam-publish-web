import type { EntryListing } from "@/db/schema";

/**
 * Where a page is listed in its graph: link only, the graph's front page, or also Discover. Stored as
 * visibility plus a Discover flag; unlisting leaves the flag alone (it has no effect while unlisted).
 */
export const LISTING_LOG: Record<EntryListing, string> = {
  unlisted: "Made unlisted",
  listed: "Made public",
  discover: "Made public and listed on Discover",
};

export function listingOf(pub: { visibility: string; discoverable: boolean }): EntryListing {
  return pub.visibility === "unlisted" ? "unlisted" : pub.discoverable ? "discover" : "listed";
}

/**
 * What choosing a listing does to the page's "Show in roam.pub search" switch: Unlisted turns it
 * off, Listed and Discoverable turn it on (Discoverable pages are always searchable).
 */
export const SEARCHABLE_FOR: Record<EntryListing, boolean> = { unlisted: false, listed: true, discover: true };

/** The columns to set for a listing. */
export function listingSet(listing: EntryListing) {
  return listing === "discover"
    ? { visibility: "public" as const, discoverable: true, searchable: true }
    : listing === "listed"
      ? { visibility: "public" as const, discoverable: false, searchable: true }
      : { visibility: "unlisted" as const, searchable: false };
}

/** Whether setting `listing` changes what readers see; unlisting ignores the Discover flag. */
export function listingChanges(before: { visibility: string; discoverable: boolean }, listing: EntryListing) {
  const b = listingOf(before);
  return listing === "unlisted" ? b !== "unlisted" : b !== listing;
}

/** Why a graph can't list pages on Discover right now, if it can't. */
export function discoverBlocked(g: {
  suspendedAt: Date | null;
  frontPage: boolean;
  indexable: boolean;
  indexAccess: string;
}) {
  return g.suspendedAt
    ? "This graph is suspended."
    : g.indexAccess !== "open"
      ? "This graph's front page is protected, so its pages can't go on Discover."
      : !g.frontPage
      ? "Turn on this graph's front page in Sharing to put pages on Discover."
      : !g.indexable
        ? "Turn on search engines in Sharing to put pages on Discover."
        : undefined;
}

/** Why this page can't be made Discoverable from its graph, if it can't: the graph's reason first. */
export function pageDiscoverBlocked(
  g: Parameters<typeof discoverBlocked>[0] & { defaultAccess: string },
  pub: { access: string; inGraph: boolean },
) {
  const effective = pub.access === "inherit" ? g.defaultAccess : pub.access;
  return (
    discoverBlocked(g) ??
    (effective !== "open"
      ? "Discover is only for pages anyone can read."
      : !pub.inGraph
        ? "This page is only in collections, so it can't go on Discover from its graph."
        : undefined)
  );
}

/**
 * Why a listed page isn't actually listed anywhere, if it isn't: with its graph's front page off,
 * nothing shows it, so only people with the link find it.
 */
export function listedNote(g: { frontPage: boolean }, pub: { visibility: string; inGraph: boolean }) {
  return pub.visibility === "public" && pub.inGraph && !g.frontPage
    ? "Your graph's front page is off, so nothing lists this page yet: only people with the link will find it. Turn the front page on in the graph's Sharing settings on roam.pub."
    : null;
}

/**
 * What the extension shows for a page's listing: where it is, why Discover is off limits, why
 * Listed doesn't list it anywhere, and whether it has a graph place to list at all.
 */
export function extListing(
  g: Parameters<typeof pageDiscoverBlocked>[0],
  pub: { visibility: string; discoverable: boolean; access: string; inGraph: boolean },
) {
  return {
    listing: listingOf(pub),
    discoverBlocked: pageDiscoverBlocked(g, pub) ?? null,
    listedNote: listedNote(g, pub),
    inGraph: pub.inGraph,
  };
}
