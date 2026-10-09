/**
 * Pinned links (lib/pins.ts): the owner pasted where they've shared a roam.pub link, so nothing that
 * would break it is allowed until they unpin it. The rules and their wording, shared by the dashboard
 * and the server (re-exported from control-rules.ts), so nothing here touches the database.
 *
 * Breaking a link means the people it was shared with can't open it the way they could: it goes
 * away (unpublished, removed from its place, the place deleted, a front page turned off), or readers
 * are asked for something new (Password or Members where it was open, Members where it was Password,
 * a different password). Discover, Public and Unlisted all keep the link working, and so does
 * republishing, since a page's old slug redirects.
 */

type Access = "open" | "password" | "members";

/** The link a pin is on: a page in its graph or in a collection, a front page, or a collection's page. */
export type PinTarget =
  | { kind: "page"; publicationId: string }
  | { kind: "entry"; entryId: string }
  | { kind: "front"; graphId: string }
  | { kind: "collection"; collectionId: string };

/** A pinned link: where its owner shared it. */
export type Pin = { sharedAt: string[] };

export const PIN_MAX_PLACES = 10;
const MAX_URL = 2000;

/** How closed each access is: a pinned link may only move down this list, never up. */
const CLOSED: Record<Access, number> = { open: 0, password: 1, members: 2 };

/** Readers who could open the link before would be asked for something new. */
export const narrowsAccess = (from: Access, to: Access) => CLOSED[to] > CLOSED[from];

/** A shared-at URL as people say it: no scheme, no "www.", no trailing slash. */
export function shortPlace(url: string) {
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
}

/** "a", "a and b", "a, b and c". */
function list(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Where a pinned link is shared, in a sentence: "x.com/a and blog.com/b". */
export const sharedAtText = (pin: Pin) => list(pin.sharedAt.map(shortPlace));

/**
 * Why a pinned link can't be changed: `link` names it ("Its link in notes", "The notes front page").
 * Undefined when there's no pin.
 */
export function pinBlocked(link: string, pin: Pin | null | undefined) {
  if (!pin) return undefined;
  return `${link} is pinned because you shared it at ${sharedAtText(pin)}. Unpin it first.`;
}

/** The words for a page's link in one place: its graph, or a collection. */
export const placeLink = (place: string) => `Its link in ${place}`;
export const frontPageLink = (graph: string) => `The ${graph} front page`;
export const collectionPageLink = (collection: string) => `${collection}'s page`;

/**
 * A change to one place a page is published, which the place's pin may refuse: taking the page out
 * of it, who can read it there, or the password readers enter there.
 */
export function placeChangeBlocked(
  place: string,
  pin: Pin | null | undefined,
  change: { removing?: boolean; from?: Access; to?: Access; passwordChanges?: boolean },
) {
  if (!pin) return undefined;
  if (change.removing || (change.from && change.to && narrowsAccess(change.from, change.to)) || change.passwordChanges)
    return pinBlocked(placeLink(place), pin);
}

/**
 * The pasted places, one per line: http(s) URLs only, 1 to PIN_MAX_PLACES, duplicates dropped. A
 * list of URLs, or why it can't be saved.
 */
export function parseSharedAt(text: string): { urls: string[] } | { error: string } {
  const lines = [...new Set(text.split(/\s*\n\s*/).map((l) => l.trim()).filter(Boolean))];
  if (lines.length === 0) return { error: "Paste at least one place you've shared it." };
  if (lines.length > PIN_MAX_PLACES) return { error: `Up to ${PIN_MAX_PLACES} places.` };
  for (const l of lines) {
    let url: URL | null = null;
    try {
      url = new URL(l);
    } catch {}
    if (!url || !/^https?:$/.test(url.protocol) || !url.hostname.includes(".") || l.length > MAX_URL)
      return { error: `"${l.length > 60 ? `${l.slice(0, 60)}…` : l}" isn't a link. Paste each place as a full https:// link.` };
  }
  return { urls: lines };
}
