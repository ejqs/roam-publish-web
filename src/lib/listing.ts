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

/** The columns to set for a listing. */
export function listingSet(listing: EntryListing) {
  return listing === "discover"
    ? { visibility: "public" as const, discoverable: true }
    : listing === "listed"
      ? { visibility: "public" as const, discoverable: false }
      : { visibility: "unlisted" as const };
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
      ? "This graph's front page is protected, so its pages can't be Discoverable."
      : !g.frontPage
      ? "Turn on this graph's front page in Sharing to make pages Discoverable."
      : !g.indexable
        ? "Turn on search engines in Sharing to make pages Discoverable."
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
      ? "Password-protected and members-only pages can't be Discoverable."
      : !pub.inGraph
        ? "This page is only in collections, so it can't be Discoverable from its graph."
        : undefined)
  );
}

/** What the extension shows for a page's listing: where it is, and why Discover is off limits. */
export function extListing(
  g: Parameters<typeof pageDiscoverBlocked>[0],
  pub: { visibility: string; discoverable: boolean; access: string; inGraph: boolean },
) {
  return { listing: listingOf(pub), discoverBlocked: pageDiscoverBlocked(g, pub) ?? null };
}
