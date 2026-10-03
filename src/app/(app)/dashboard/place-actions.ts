"use server";

import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import {
  ACCESS,
  collection,
  collectionEntry,
  ENTRY_LISTING,
  graph,
  PLACE_ACCESS,
  PLACE_VIEWS,
  publication,
  SHOW_AUTHOR,
} from "@/db/schema";
import { ACCESS_LABELS } from "@/components/manage/labels";
import { auth } from "@/lib/auth";
import { type Change, logChange, logChanges, logForPublications, roamInert } from "@/lib/changelog";
import { addEntry, canManageEntry, collectionRole } from "@/lib/collections";
import { DISCOVER_TAG } from "@/lib/discover";
import { clearGatedCollectionDiscover, clearGatedGraphDiscover } from "@/lib/discover-rules";
import { hashPassword, Password } from "@/lib/gates";
import { manageablePublications } from "@/lib/graph-access";
import { collectionUrl, entryUrl } from "@/lib/publications";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Settings for one place a page appears: its graph (/{graph}/{uid}) or a collection entry
 * (/c/{entryUid}). Shared by the dashboard and the Manage dialog on published pages.
 */

export type PlaceResult = { ok: boolean; message: string };

async function userId() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

function revalidateAll() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/[graph]", "layout");
  revalidatePath("/c/[id]", "layout");
  revalidatePath("/u/[username]", "page");
  revalidatePath("/");
  updateTag(DISCOVER_TAG);
}

const PlaceInput = z.object({
  access: z.enum(PLACE_ACCESS).optional(),
  showAuthor: z.enum(SHOW_AUTHOR).optional(),
  views: z.enum(PLACE_VIEWS).optional(),
  showViewCountries: z.enum(SHOW_AUTHOR).optional(),
  /** A new password for this page only. */
  password: Password.optional(),
  /** Drop this page's own password, so password access falls back to its graph's or collection's. */
  clearPassword: z.boolean().optional(),
});
export type PlaceInput = z.input<typeof PlaceInput>;

const LISTING_LOG = { unlisted: "Not listed", listed: "Listed", discover: "Listed on Discover" } as const;

const SESSION_EXPIRED: PlaceResult = { ok: false, message: "Your session expired. Please log in again." };
const NOT_ALLOWED: PlaceResult = { ok: false, message: "You can't change this page." };
const NEEDS_PASSWORD = (where: string) =>
  `Set a password for this page, or give the ${where} a password in its settings.`;

const accessLabel = (a: (typeof PLACE_ACCESS)[number], fallback: (typeof ACCESS)[number]) =>
  a === "inherit" ? `${ACCESS_LABELS[fallback]} (default)` : ACCESS_LABELS[a];
// The collection's owner may be outside the page's graph, so its name goes into Roam inert.
const collectionLink = (c: { name: string; slug: string }) => `[${roamInert(c.name) || c.slug}](${collectionUrl(c.slug)})`;

/** Change log wording for a place's settings change; empty when nothing a reader would notice changed. */
function describePlace(
  where: string,
  input: z.output<typeof PlaceInput>,
  before: { access: (typeof PLACE_ACCESS)[number] },
  defaultAccess: (typeof ACCESS)[number],
) {
  const parts: string[] = [];
  if (input.access && input.access !== before.access)
    parts.push(`Access ${where}: ${accessLabel(input.access, defaultAccess)}`);
  if (input.password) parts.push(`Password ${where} changed`);
  else if (input.clearPassword) parts.push(`Own password ${where} removed`);
  return parts;
}

/** Applies a password change; returns the column updates. */
function passwordUpdate(input: z.output<typeof PlaceInput>, current: { passwordVersion: number }) {
  if (input.password) return { passwordHash: hashPassword(input.password), passwordVersion: current.passwordVersion + 1 };
  if (input.clearPassword) return { passwordHash: null, passwordVersion: current.passwordVersion + 1 };
  return {};
}

/** Graph place of a page: access, own password, byline, and whether it's shown in the graph at all. */
export async function updateGraphPlace(
  publicationId: string,
  raw: PlaceInput & { inGraph?: boolean },
): Promise<PlaceResult> {
  const uid = await userId();
  if (!uid) return SESSION_EXPIRED;
  const parsed = PlaceInput.extend({ inGraph: z.boolean().optional() }).safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const input = parsed.data;
  if (input.password && !rateLimit(`password:user:${uid}`, 30, 15 * 60 * 1000))
    return { ok: false, message: "Too many changes. Try again in a few minutes." };

  const [row] = await db
    .select({ pub: publication, g: graph })
    .from(publication)
    .innerJoin(graph, eq(graph.id, publication.graphId))
    .where(and(eq(publication.id, publicationId), manageablePublications(uid)))
    .limit(1);
  if (!row) return NOT_ALLOWED;
  const { pub, g } = row;

  const access = input.access ?? pub.access;
  const ownPassword = input.password ? true : input.clearPassword ? false : !!pub.passwordHash;
  const effective = access === "inherit" ? g.defaultAccess : access;
  if (effective === "password" && !ownPassword && !g.passwordHash)
    return { ok: false, message: NEEDS_PASSWORD("graph") };

  if (input.inGraph === false) {
    const inCollections = await db.query.collectionEntry.findFirst({
      where: eq(collectionEntry.publicationId, pub.id),
    });
    if (!inCollections)
      return { ok: false, message: "Add it to a collection first, or unpublish it instead." };
  }

  await db
    .update(publication)
    .set({
      ...(input.access && { access: input.access }),
      ...(input.showAuthor && { showAuthor: input.showAuthor }),
      ...(input.views && { views: input.views }),
      ...(input.showViewCountries && { showViewCountries: input.showViewCountries }),
      ...(input.inGraph !== undefined && { inGraph: input.inGraph }),
      ...passwordUpdate(input, pub),
    })
    .where(eq(publication.id, pub.id));
  await clearGatedGraphDiscover(g.id);
  const log = describePlace("in the graph", input, pub, g.defaultAccess);
  if (input.inGraph !== undefined && input.inGraph !== pub.inGraph)
    log.push(input.inGraph ? "Shown in the graph again" : "Hidden from the graph (collections only)");
  if (log.length) logChange(pub, log.join("; "));
  revalidateAll();
  return { ok: true, message: input.password ? "Password set." : "Saved." };
}

/** A page's place in a collection. Collection owners manage every entry; members their own. */
export async function updateEntry(
  entryId: string,
  raw: PlaceInput & { listing?: (typeof ENTRY_LISTING)[number] },
): Promise<PlaceResult> {
  const uid = await userId();
  if (!uid) return SESSION_EXPIRED;
  const parsed = PlaceInput.extend({ listing: z.enum(ENTRY_LISTING).optional() }).safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const input = parsed.data;
  if (input.password && !rateLimit(`password:user:${uid}`, 30, 15 * 60 * 1000))
    return { ok: false, message: "Too many changes. Try again in a few minutes." };

  const [row] = await db
    .select({ entry: collectionEntry, c: collection })
    .from(collectionEntry)
    .innerJoin(collection, eq(collection.id, collectionEntry.collectionId))
    .where(eq(collectionEntry.id, entryId))
    .limit(1);
  if (!row) return NOT_ALLOWED;
  const { entry, c } = row;
  if (!canManageEntry(await collectionRole(uid, c.id), uid, entry)) return NOT_ALLOWED;

  const access = input.access ?? entry.access;
  const ownPassword = input.password ? true : input.clearPassword ? false : !!entry.passwordHash;
  const effective = access === "inherit" ? c.defaultAccess : access;
  if (effective === "password" && !ownPassword && !c.passwordHash)
    return { ok: false, message: NEEDS_PASSWORD("collection") };
  const listing = input.listing ?? entry.listing;
  if (listing === "discover") {
    if (effective !== "open")
      return { ok: false, message: "Password-protected and members-only pages can't be listed on Discover." };
    if (c.indexAccess !== "open" || !c.indexable || c.suspendedAt)
      return { ok: false, message: "Make the collection open and indexable to list its pages on Discover." };
  }

  await db
    .update(collectionEntry)
    .set({
      ...(input.access && { access: input.access }),
      ...(input.showAuthor && { showAuthor: input.showAuthor }),
      ...(input.views && { views: input.views }),
      ...(input.showViewCountries && { showViewCountries: input.showViewCountries }),
      ...(input.listing && { listing: input.listing }),
      ...passwordUpdate(input, entry),
    })
    .where(eq(collectionEntry.id, entry.id));
  await clearGatedCollectionDiscover(c.id);
  const log = describePlace(`in ${collectionLink(c)}`, input, entry, c.defaultAccess);
  if (input.listing && input.listing !== entry.listing)
    log.push(`${LISTING_LOG[input.listing]} in ${collectionLink(c)}`);
  if (log.length) await logForPublications([entry.publicationId], log.join("; "));
  revalidateAll();
  return { ok: true, message: input.password ? "Password set." : "Saved." };
}

/** Adds a page you manage to a collection you own or belong to. */
export async function addToCollection(publicationId: string, collectionId: string): Promise<PlaceResult> {
  const uid = await userId();
  if (!uid) return SESSION_EXPIRED;
  const [pub] = await db
    .select({ id: publication.id })
    .from(publication)
    .where(and(eq(publication.id, publicationId), manageablePublications(uid)))
    .limit(1);
  if (!pub) return NOT_ALLOWED;
  if (!(await collectionRole(uid, collectionId))) return { ok: false, message: "Join that collection first." };
  const c = await db.query.collection.findFirst({ where: eq(collection.id, collectionId) });
  if (!c || c.suspendedAt) return { ok: false, message: "That collection isn't available." };
  const entry = await addEntry(collectionId, publicationId, uid);
  if (!entry) return { ok: false, message: "It's already in that collection." };
  await logForPublications([publicationId], (p) => `Added to collection ${collectionLink(c)}: ${entryUrl(c.slug, entry.entryUid, p.title)}`);
  revalidateAll();
  return { ok: true, message: `Added to ${c.name}.` };
}

/**
 * Takes a page out of a collection: by whoever manages the entry, or whoever manages the page.
 * A page can't be left with no place at all; unpublish it instead.
 */
export async function removeEntry(entryId: string): Promise<PlaceResult> {
  const uid = await userId();
  if (!uid) return SESSION_EXPIRED;
  const entry = await db.query.collectionEntry.findFirst({ where: eq(collectionEntry.id, entryId) });
  if (!entry) return NOT_ALLOWED;
  const [managed] = await db
    .select({ id: publication.id, inGraph: publication.inGraph })
    .from(publication)
    .where(and(eq(publication.id, entry.publicationId), manageablePublications(uid)))
    .limit(1);
  if (!managed && !canManageEntry(await collectionRole(uid, entry.collectionId), uid, entry)) return NOT_ALLOWED;
  const pub = await db.query.publication.findFirst({ where: eq(publication.id, entry.publicationId) });
  const c = await db.query.collection.findFirst({ where: eq(collection.id, entry.collectionId) });
  let backInGraph = false;
  if (pub && !pub.inGraph) {
    const others = await db.query.collectionEntry.findMany({
      where: eq(collectionEntry.publicationId, entry.publicationId),
      columns: { id: true },
    });
    // Its last place: put it back in its graph (unlisted) rather than strand it.
    if (others.length <= 1) {
      await db.update(publication).set({ inGraph: true, visibility: "unlisted" }).where(eq(publication.id, pub.id));
      backInGraph = true;
    }
  }
  await db.delete(collectionEntry).where(eq(collectionEntry.id, entry.id));
  if (pub)
    logChange(
      pub,
      `Removed from collection ${c ? collectionLink(c) : ""}`.trim() + (backInGraph ? "; back in the graph, unlisted" : ""),
    );
  revalidateAll();
  return { ok: true, message: "Removed from the collection." };
}

/**
 * Sets who can read every page in a graph or collection at once. Pages matching the container's
 * default follow it; own passwords are kept. Owner only.
 */
export async function applyAccessToAllPages(
  kind: "graph" | "collection",
  containerId: string,
  raw: (typeof ACCESS)[number],
): Promise<PlaceResult> {
  const uid = await userId();
  if (!uid) return SESSION_EXPIRED;
  const parsed = z.enum(ACCESS).safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Pick who can read." };
  const access = parsed.data;

  const c =
    kind === "graph"
      ? await db.query.graph.findFirst({ where: and(eq(graph.id, containerId), eq(graph.userId, uid)) })
      : await db.query.collection.findFirst({
          where: and(eq(collection.id, containerId), eq(collection.ownerId, uid)),
        });
  if (!c) return NOT_ALLOWED;
  const value = access === c.defaultAccess ? ("inherit" as const) : access;

  if (access === "password" && !c.passwordHash) {
    // Every page would need its own password.
    const table = kind === "graph" ? publication : collectionEntry;
    const parent = kind === "graph" ? publication.graphId : collectionEntry.collectionId;
    const [missing] = await db
      .select({ n: count() })
      .from(table)
      .where(and(eq(parent, c.id), isNull(table.passwordHash)));
    if (missing.n > 0) return { ok: false, message: NEEDS_PASSWORD(kind) };
  }

  // Pages whose effective access actually changes get a change log entry.
  const before =
    kind === "graph"
      ? await db
          .select({ id: publication.id, access: publication.access })
          .from(publication)
          .where(eq(publication.graphId, c.id))
      : await db
          .select({ id: collectionEntry.publicationId, access: collectionEntry.access })
          .from(collectionEntry)
          .where(eq(collectionEntry.collectionId, c.id));
  const affected = before
    .filter((p) => (p.access === "inherit" ? c.defaultAccess : p.access) !== access)
    .map((p) => p.id);

  const updated =
    kind === "graph"
      ? await db
          .update(publication)
          .set({ access: value })
          .where(eq(publication.graphId, c.id))
          .returning({ id: publication.id })
      : await db
          .update(collectionEntry)
          .set({ access: value })
          .where(eq(collectionEntry.collectionId, c.id))
          .returning({ id: collectionEntry.id });
  if (kind === "graph") await clearGatedGraphDiscover(c.id);
  else await clearGatedCollectionDiscover(c.id);
  const where = kind === "graph" ? "in the graph" : `in ${collectionLink(c as { name: string; slug: string })}`;
  await logForPublications(affected, `Access ${where}: ${ACCESS_LABELS[access]} (applied to all pages)`);
  revalidateAll();
  const n = updated.length;
  return { ok: true, message: `Updated ${n.toLocaleString("en-US")} ${n === 1 ? "page" : "pages"}.` };
}

const BulkInput = z.object({
  ids: z.array(z.string()).min(1).max(100),
  /** Where it's listed in its graph. */
  reach: z.enum(["unlisted", "public", "discover"]).optional(),
  /** Who can read it in its graph. */
  read: z.enum(ACCESS).optional(),
});
export type BulkInput = z.input<typeof BulkInput>;

const plural = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "page" : "pages"}`;

/**
 * Changes where several pages are listed or who can read them, in their graphs. Pages the viewer
 * can't manage are skipped, and so are changes a page can't take: Password without any password
 * to use, and Discover for a protected page (it's listed instead).
 */
export async function bulkUpdatePublications(raw: BulkInput): Promise<PlaceResult> {
  const uid = await userId();
  if (!uid) return SESSION_EXPIRED;
  const parsed = BulkInput.safeParse(raw);
  if (!parsed.success || (!parsed.data.reach && !parsed.data.read)) return { ok: false, message: "Nothing to change." };
  const { ids, reach, read } = parsed.data;

  const rows = await db
    .select({ pub: publication, g: graph })
    .from(publication)
    .innerJoin(graph, eq(graph.id, publication.graphId))
    .where(and(inArray(publication.id, ids), manageablePublications(uid), isNull(publication.removedAt)));
  if (rows.length === 0) return NOT_ALLOWED;

  let noPassword = 0;
  let notDiscover = 0;
  let changed = 0;
  const log: Change[] = [];
  for (const { pub, g } of rows) {
    const set: Partial<typeof publication.$inferInsert> = {};
    let access = pub.access === "inherit" ? g.defaultAccess : pub.access;
    if (read) {
      if (read === "password" && !pub.passwordHash && !g.passwordHash) noPassword++;
      else set.access = access = read;
    }
    if (reach === "unlisted") set.visibility = "unlisted";
    else if (reach === "public") Object.assign(set, { visibility: "public", discoverable: false });
    else if (reach === "discover") {
      const ok = access === "open" && g.indexAccess === "open" && pub.inGraph;
      Object.assign(set, { visibility: "public", discoverable: ok });
      if (!ok) notDiscover++;
    }
    if (Object.keys(set).length === 0) continue;
    await db.update(publication).set(set).where(eq(publication.id, pub.id));
    changed++;
    const text = [
      set.access && set.access !== pub.access && `Access in the graph: ${ACCESS_LABELS[set.access as (typeof ACCESS)[number]]}`,
      set.visibility &&
        (set.visibility !== pub.visibility || set.discoverable !== undefined && set.discoverable !== pub.discoverable) &&
        (set.visibility === "unlisted" ? "Made unlisted" : set.discoverable ? "Made public and listed on Discover" : "Made public"),
    ].filter(Boolean);
    if (text.length) log.push({ graphId: pub.graphId, rootUid: pub.rootUid, text: text.join("; ") });
  }
  logChanges(log);
  for (const graphId of new Set(rows.map((r) => r.g.id))) await clearGatedGraphDiscover(graphId);
  revalidateAll();

  const notes = [
    noPassword && `${plural(noPassword)} kept their access: set a graph password, or one per page, to use Password.`,
    notDiscover && `${plural(notDiscover)} can't go on Discover while protected, so they're listed instead.`,
  ].filter(Boolean);
  if (changed === 0) return { ok: false, message: notes.join(" ") || "Nothing changed." };
  return { ok: true, message: [`Updated ${plural(changed)}.`, ...notes].join(" ") };
}

/**
 * Collection entries' version of bulkUpdatePublications: where several pages are listed in the
 * collection, or who can read them there. Entries the viewer can't manage are skipped.
 */
export async function bulkUpdateEntries(raw: BulkInput): Promise<PlaceResult> {
  const uid = await userId();
  if (!uid) return SESSION_EXPIRED;
  const parsed = BulkInput.safeParse(raw);
  if (!parsed.success || (!parsed.data.reach && !parsed.data.read)) return { ok: false, message: "Nothing to change." };
  const { ids, reach, read } = parsed.data;

  const rows = await db
    .select({ entry: collectionEntry, c: collection })
    .from(collectionEntry)
    .innerJoin(collection, eq(collection.id, collectionEntry.collectionId))
    .where(inArray(collectionEntry.id, ids));
  const roles = new Map<string, Awaited<ReturnType<typeof collectionRole>>>();
  for (const id of new Set(rows.map((r) => r.c.id))) roles.set(id, await collectionRole(uid, id));
  const mine = rows.filter(({ entry, c }) => canManageEntry(roles.get(c.id) ?? null, uid, entry));
  if (mine.length === 0) return NOT_ALLOWED;

  let noPassword = 0;
  let notDiscover = 0;
  let changed = 0;
  const log = new Map<string, string[]>();
  for (const { entry, c } of mine) {
    const set: Partial<typeof collectionEntry.$inferInsert> = {};
    let access = entry.access === "inherit" ? c.defaultAccess : entry.access;
    if (read) {
      if (read === "password" && !entry.passwordHash && !c.passwordHash) noPassword++;
      else set.access = access = read;
    }
    if (reach === "unlisted") set.listing = "unlisted";
    else if (reach === "public") set.listing = "listed";
    else if (reach === "discover") {
      const ok = access === "open" && c.indexAccess === "open" && c.indexable && !c.suspendedAt;
      set.listing = ok ? "discover" : "listed";
      if (!ok) notDiscover++;
    }
    if (Object.keys(set).length === 0) continue;
    await db.update(collectionEntry).set(set).where(eq(collectionEntry.id, entry.id));
    changed++;
    const text = [
      set.access && set.access !== entry.access && `Access in ${collectionLink(c)}: ${ACCESS_LABELS[set.access as (typeof ACCESS)[number]]}`,
      set.listing && set.listing !== entry.listing && `${LISTING_LOG[set.listing]} in ${collectionLink(c)}`,
    ].filter(Boolean).join("; ");
    if (text) log.set(text, [...(log.get(text) ?? []), entry.publicationId]);
  }
  for (const [text, pubIds] of log) await logForPublications(pubIds, text);
  for (const id of roles.keys()) await clearGatedCollectionDiscover(id);
  revalidateAll();

  const notes = [
    noPassword && `${plural(noPassword)} kept their access: set a collection password, or one per page, to use Password.`,
    notDiscover && `${plural(notDiscover)} can't go on Discover here, so they're listed instead.`,
  ].filter(Boolean);
  if (changed === 0) return { ok: false, message: notes.join(" ") || "Nothing changed." };
  return { ok: true, message: [`Updated ${plural(changed)}.`, ...notes].join(" ") };
}
