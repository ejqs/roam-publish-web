"use server";

import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
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
import type { ChangeCategory } from "@/lib/changelog-categories";
import { addEntry, canManageEntry, collectionRole } from "@/lib/collections";
import { DISCOVER_TAG } from "@/lib/discover";
import { clearGatedCollectionDiscover, clearGatedGraphDiscover } from "@/lib/discover-rules";
import {
  contentKeyFor,
  dropLock,
  dropOrphanLockKeys,
  KeysError,
  setLockPassword,
  spotsOf,
  syncPublicationKeys,
  type VersionedLock,
} from "@/lib/encryption";
import { hashPassword, Password } from "@/lib/gates";
import { manageablePublications } from "@/lib/graph-access";
import { SEARCHABLE_FOR } from "@/lib/listing";
import { collectionUrl, entryUrl } from "@/lib/publications";
import { rateLimit } from "@/lib/rate-limit";
import { withAction } from "@/lib/telemetry";

/**
 * Settings for one place a page appears: its graph (/{graph}/{uid}) or a collection entry
 * (/c/{entryUid}). Shared by the dashboard and the Manage dialog on published pages.
 */

export type PlaceResult = {
  ok: boolean;
  message: string;
  /** The page is encrypted and the change needs one of its passwords: ask, and send it as `currentPassword`. */
  needCurrentPassword?: boolean;
};

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
  /** For an encrypted page: a password that opens it now, when the change needs its content key. */
  currentPassword: z.string().max(200).optional(),
});
export type PlaceInput = z.input<typeof PlaceInput>;

const LISTING_LOG = { unlisted: "Unlisted", listed: "Listed", discover: "Discoverable" } as const;

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

/** Runs a change to an encrypted page's places, turning a refusal from its keys into a result. */
async function withKeys(fn: () => Promise<PlaceResult>): Promise<PlaceResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof KeysError) return { ok: false, message: e.message, needCurrentPassword: e.need === "currentPassword" };
    throw e;
  }
}

/** The content key of an encrypted page, opened before a change that could stop the viewer's cookie fitting. */
async function preKey(pub: { id: string; encrypted: boolean }, currentPassword?: string) {
  return pub.encrypted ? contentKeyFor(db, pub, { passwords: currentPassword ? [currentPassword] : [] }) : null;
}

const triesLeft = (uid: string, input: { password?: string; currentPassword?: string }) =>
  !(input.password || input.currentPassword) || rateLimit(`password:user:${uid}`, 30, 15 * 60 * 1000);

/**
 * A place's own password changed: keeps its key pair in step (the same one, re-encrypted, while
 * encrypted pages are sealed to it), or drops it with the password. Runs inside the change's
 * transaction, before the page's keys are synced.
 */
async function ownPasswordKeys(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  lock: VersionedLock,
  input: { password?: string; clearPassword?: boolean; currentPassword?: string },
) {
  if (input.password) await setLockPassword(tx, lock, input.password, { currentPassword: input.currentPassword });
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
  return withAction("dashboard.places.updateGraphPlace", async () => {
    const uid = await userId();
    if (!uid) return SESSION_EXPIRED;
    const parsed = PlaceInput.extend({ inGraph: z.boolean().optional() }).safeParse(raw);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const input = parsed.data;
    if (!triesLeft(uid, input)) return { ok: false, message: "Too many changes. Try again in a few minutes." };

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

    const ck = await preKey(pub, input.currentPassword);
    const ownLock: VersionedLock = { scope: "publication", id: pub.id, version: pub.passwordVersion };
    const saved = await withKeys(async () => {
      await db.transaction(async (tx) => {
        await tx
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
        await ownPasswordKeys(tx, ownLock, input);
        await syncPublicationKeys(tx, pub.id, { contentKey: ck });
        if (input.clearPassword) await dropLock(tx, ownLock);
      });
      return { ok: true, message: "" };
    });
    if (!saved.ok) return saved;
    await clearGatedGraphDiscover(g.id);
    const page = { graphId: pub.graphId, rootUid: pub.rootUid };
    const log: Change[] = [];
    const accessLog = describePlace("in the graph", input, pub, g.defaultAccess);
    if (accessLog.length) log.push({ ...page, category: "access", text: accessLog.join("; ") });
    if (input.inGraph !== undefined && input.inGraph !== pub.inGraph)
      log.push({ ...page, category: "listing", text: input.inGraph ? "Shown in the graph again" : "Hidden from the graph (collections only)" });
    logChanges(log);
    revalidateAll();
    return { ok: true, message: input.password ? "Password set." : "Saved." };
  });
}

/** A page's place in a collection. Collection owners manage every entry; members their own. */
export async function updateEntry(
  entryId: string,
  raw: PlaceInput & { listing?: (typeof ENTRY_LISTING)[number] },
): Promise<PlaceResult> {
  return withAction("dashboard.places.updateEntry", async () => {
    const uid = await userId();
    if (!uid) return SESSION_EXPIRED;
    const parsed = PlaceInput.extend({ listing: z.enum(ENTRY_LISTING).optional() }).safeParse(raw);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const input = parsed.data;
    if (!triesLeft(uid, input)) return { ok: false, message: "Too many changes. Try again in a few minutes." };

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

    const pub = await db.query.publication.findFirst({
      where: eq(publication.id, entry.publicationId),
      columns: { id: true, encrypted: true },
    });
    const ck = pub ? await preKey(pub, input.currentPassword) : null;
    const ownLock: VersionedLock = { scope: "entry", id: entry.id, version: entry.passwordVersion };
    const saved = await withKeys(async () => {
      await db.transaction(async (tx) => {
        await tx
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
        await ownPasswordKeys(tx, ownLock, input);
        await syncPublicationKeys(tx, entry.publicationId, { contentKey: ck });
        if (input.clearPassword) await dropLock(tx, ownLock);
        if (input.listing && input.listing !== entry.listing)
          await tx
            .update(publication)
            .set({ searchable: SEARCHABLE_FOR[input.listing] })
            .where(eq(publication.id, entry.publicationId));
      });
      return { ok: true, message: "" };
    });
    if (!saved.ok) return saved;
    await clearGatedCollectionDiscover(c.id);
    const accessLog = describePlace(`in ${collectionLink(c)}`, input, entry, c.defaultAccess);
    if (accessLog.length) await logForPublications([entry.publicationId], "access", accessLog.join("; "));
    if (input.listing && input.listing !== entry.listing)
      await logForPublications([entry.publicationId], "listing", `${LISTING_LOG[input.listing]} in ${collectionLink(c)}`);
    revalidateAll();
    return { ok: true, message: input.password ? "Password set." : "Saved." };
  });
}

/**
 * Adds a page you manage to a collection you own or belong to. An encrypted page goes in with
 * Password access, so the collection needs a password, and sealing its key there needs one of the
 * page's passwords (`currentPassword`, unless the viewer unlocked it in this browser).
 */
export async function addToCollection(
  publicationId: string,
  collectionId: string,
  currentPassword?: string,
): Promise<PlaceResult> {
  return withAction("dashboard.places.addToCollection", async () => {
    const uid = await userId();
    if (!uid) return SESSION_EXPIRED;
    if (currentPassword !== undefined && (currentPassword.length > 200 || !triesLeft(uid, { currentPassword })))
      return { ok: false, message: "Too many tries. Try again in a few minutes." };
    const [pub] = await db
      .select({ id: publication.id, encrypted: publication.encrypted })
      .from(publication)
      .where(and(eq(publication.id, publicationId), manageablePublications(uid)))
      .limit(1);
    if (!pub) return NOT_ALLOWED;
    if (!(await collectionRole(uid, collectionId))) return { ok: false, message: "Join that collection first." };
    const c = await db.query.collection.findFirst({ where: eq(collection.id, collectionId) });
    if (!c || c.suspendedAt) return { ok: false, message: "That collection isn't available." };
    if (pub.encrypted && !c.passwordHash)
      return { ok: false, message: `This page is encrypted. Give ${c.name} a password first, or turn off encryption.` };
    const ck = await preKey(pub, currentPassword);
    if (pub.encrypted && !ck)
      return {
        ok: false,
        needCurrentPassword: true,
        message: currentPassword ? "That password doesn't open this page." : "This page is encrypted. Enter its current password to add it.",
      };
    const entry = await addEntry(collectionId, publicationId, uid);
    if (!entry) return { ok: false, message: "It's already in that collection." };
    if (pub.encrypted) {
      const sealed = await withKeys(async () => {
        await db.transaction(async (tx) => {
          await tx.update(collectionEntry).set({ access: "password", listing: "listed" }).where(eq(collectionEntry.id, entry.id));
          await syncPublicationKeys(tx, pub.id, { contentKey: ck });
        });
        return { ok: true, message: "" };
      });
      if (!sealed.ok) {
        await db.delete(collectionEntry).where(eq(collectionEntry.id, entry.id));
        return sealed;
      }
    }
    await logForPublications([publicationId], "collections", (p) => `Added to collection ${collectionLink(c)}: ${entryUrl(c.slug, entry.entryUid, p.title)}`);
    revalidateAll();
    return { ok: true, message: `Added to ${c.name}.` };
  });
}

/**
 * Takes a page out of a collection: by whoever manages the entry, or whoever manages the page.
 * A page can't be left with no place at all; unpublish it instead.
 */
export async function removeEntry(entryId: string, currentPassword?: string): Promise<PlaceResult> {
  return withAction("dashboard.places.removeEntry", async () => {
    const uid = await userId();
    if (!uid) return SESSION_EXPIRED;
    if (currentPassword !== undefined && (currentPassword.length > 200 || !triesLeft(uid, { currentPassword })))
      return { ok: false, message: "Too many tries. Try again in a few minutes." };
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
    const ck = pub ? await preKey(pub, currentPassword) : null;
    const removed = await withKeys(async () => {
      await db.transaction(async (tx) => {
        if (pub && !pub.inGraph) {
          const others = await tx.query.collectionEntry.findMany({
            where: eq(collectionEntry.publicationId, entry.publicationId),
            columns: { id: true },
          });
          // Its last place: put it back in its graph (unlisted) rather than strand it.
          if (others.length <= 1) {
            await tx.update(publication).set({ inGraph: true, visibility: "unlisted" }).where(eq(publication.id, pub.id));
            backInGraph = true;
          }
        }
        await tx.delete(collectionEntry).where(eq(collectionEntry.id, entry.id));
        if (pub?.encrypted) {
          // An encrypted page back in its graph uses Password there, when there's a password to use.
          const [graphSpot] = await spotsOf(tx, pub.id);
          if (backInGraph && !graphSpot.lock)
            throw new KeysError(
              `${c?.name ?? "This collection"} is the last place this page is shown, and ${graphSpot.label} has no password, so the encrypted page can't move back there. Unpublish it, or turn off encryption.`,
            );
          if (backInGraph && graphSpot.access !== "password")
            await tx.update(publication).set({ access: "password" }).where(eq(publication.id, pub.id));
          await syncPublicationKeys(tx, pub.id, { contentKey: ck });
        }
      });
      return { ok: true, message: "" };
    });
    if (!removed.ok) return removed;
    await dropOrphanLockKeys(db);
    if (pub)
      logChange(
        pub,
        "collections",
        `Removed from collection ${c ? collectionLink(c) : ""}`.trim() + (backInGraph ? "; back in the graph, unlisted" : ""),
      );
    revalidateAll();
    return { ok: true, message: "Removed from the collection." };
  });
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
  return withAction("dashboard.places.applyAccessToAllPages", async () => {
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
    // Encrypted pages only use Password: they keep it.
    const encryptedIds = new Set(
      access === "password"
        ? []
        : (
            await db
              .select({ id: publication.id })
              .from(publication)
              .where(
                and(
                  eq(publication.encrypted, true),
                  kind === "graph"
                    ? eq(publication.graphId, c.id)
                    : sql`${publication.id} in (select publication_id from collection_entry where collection_id = ${c.id})`,
                ),
              )
          ).map((p) => p.id),
    );
    const affected = before
      .filter((p) => !encryptedIds.has(p.id) && (p.access === "inherit" ? c.defaultAccess : p.access) !== access)
      .map((p) => p.id);
    const notEncrypted =
      kind === "graph"
        ? sql`not ${publication.encrypted}`
        : sql`${collectionEntry.publicationId} not in (select id from publication where encrypted)`;

    const updated =
      kind === "graph"
        ? await db
            .update(publication)
            .set({ access: value })
            .where(and(eq(publication.graphId, c.id), encryptedIds.size ? notEncrypted : undefined))
            .returning({ id: publication.id })
        : await db
            .update(collectionEntry)
            .set({ access: value })
            .where(and(eq(collectionEntry.collectionId, c.id), encryptedIds.size ? notEncrypted : undefined))
            .returning({ id: collectionEntry.id });
    if (kind === "graph") await clearGatedGraphDiscover(c.id);
    else await clearGatedCollectionDiscover(c.id);
    const where = kind === "graph" ? "in the graph" : `in ${collectionLink(c as { name: string; slug: string })}`;
    await logForPublications(affected, "access", `Access ${where}: ${ACCESS_LABELS[access]} (applied to all pages)`);
    revalidateAll();
    const n = updated.length;
    const kept = encryptedIds.size ? ` ${ENCRYPTED_KEPT(encryptedIds.size)}` : "";
    return { ok: true, message: `Updated ${n.toLocaleString("en-US")} ${n === 1 ? "page" : "pages"}.${kept}` };
  });
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
const ENCRYPTED_KEPT = (n: number) =>
  `${n.toLocaleString("en-US")} encrypted ${n === 1 ? "page" : "pages"} kept Password: turn off ${n === 1 ? "its" : "their"} encryption to change who can read ${n === 1 ? "it" : "them"}.`;

/**
 * Changes where several pages are listed or who can read them, in their graphs. Pages the viewer
 * can't manage are skipped, and so are changes a page can't take: Password without any password
 * to use, and Discover for a protected page (it's listed instead).
 */
export async function bulkUpdatePublications(raw: BulkInput): Promise<PlaceResult> {
  return withAction("dashboard.places.bulkUpdatePublications", async () => {
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
    let keptEncrypted = 0;
    let changed = 0;
    const log: Change[] = [];
    for (const { pub, g } of rows) {
      const set: Partial<typeof publication.$inferInsert> = {};
      let access = pub.access === "inherit" ? g.defaultAccess : pub.access;
      if (read) {
        if (read !== "password" && pub.encrypted) keptEncrypted++;
        else if (read === "password" && !pub.passwordHash && !g.passwordHash) noPassword++;
        else set.access = access = read;
      }
      if (reach === "unlisted") Object.assign(set, { visibility: "unlisted", searchable: false });
      else if (reach === "public") Object.assign(set, { visibility: "public", discoverable: false, searchable: true });
      else if (reach === "discover") {
        const ok = access === "open" && g.indexAccess === "open" && pub.inGraph;
        Object.assign(set, { visibility: "public", discoverable: ok, searchable: true });
        if (!ok) notDiscover++;
      }
      if (Object.keys(set).length === 0) continue;
      await db.update(publication).set(set).where(eq(publication.id, pub.id));
      changed++;
      const page = { graphId: pub.graphId, rootUid: pub.rootUid };
      if (set.access && set.access !== pub.access)
        log.push({ ...page, category: "access", text: `Access in the graph: ${ACCESS_LABELS[set.access as (typeof ACCESS)[number]]}` });
      if (set.visibility && (set.visibility !== pub.visibility || set.discoverable !== undefined && set.discoverable !== pub.discoverable))
        log.push({
          ...page,
          category: "listing",
          text: set.visibility === "unlisted" ? "Made unlisted" : set.discoverable ? "Made public and listed on Discover" : "Made public",
        });
    }
    logChanges(log);
    for (const graphId of new Set(rows.map((r) => r.g.id))) await clearGatedGraphDiscover(graphId);
    revalidateAll();

    const notes = [
      noPassword && `${plural(noPassword)} kept their access: set a graph password, or one per page, to use Password.`,
      notDiscover && `${plural(notDiscover)} can't go on Discover while protected, so they're listed instead.`,
      keptEncrypted && ENCRYPTED_KEPT(keptEncrypted),
    ].filter(Boolean);
    if (changed === 0) return { ok: false, message: notes.join(" ") || "Nothing changed." };
    return { ok: true, message: [`Updated ${plural(changed)}.`, ...notes].join(" ") };
  });
}

/**
 * Unpublishes several pages everywhere, like `unpublish` does for one. Pages the viewer can't
 * manage are skipped. Removed pages stay locked so a republish can't undo the takedown.
 */
export async function bulkUnpublish(raw: { ids: string[] }): Promise<PlaceResult> {
  return withAction("dashboard.places.bulkUnpublish", async () => {
    const uid = await userId();
    if (!uid) return SESSION_EXPIRED;
    const parsed = z.object({ ids: z.array(z.string()).min(1).max(100) }).safeParse(raw);
    if (!parsed.success) return { ok: false, message: "Nothing to unpublish." };
    const deleted = await db
      .delete(publication)
      .where(and(inArray(publication.id, parsed.data.ids), manageablePublications(uid)))
      .returning({ graphId: publication.graphId, rootUid: publication.rootUid });
    if (deleted.length === 0) return NOT_ALLOWED;
    await dropOrphanLockKeys(db);
    logChanges(deleted.map((p) => ({ ...p, category: "publishing" as const, text: "Unpublished on the website" })));
    revalidateAll();
    const skipped = parsed.data.ids.length - deleted.length;
    return {
      ok: true,
      message: `Unpublished ${plural(deleted.length)}.${skipped ? ` Skipped ${skipped} you can't manage.` : ""}`,
    };
  });
}

/**
 * Collection entries' version of bulkUpdatePublications: where several pages are listed in the
 * collection, or who can read them there. Entries the viewer can't manage are skipped.
 */
export async function bulkUpdateEntries(raw: BulkInput): Promise<PlaceResult> {
  return withAction("dashboard.places.bulkUpdateEntries", async () => {
    const uid = await userId();
    if (!uid) return SESSION_EXPIRED;
    const parsed = BulkInput.safeParse(raw);
    if (!parsed.success || (!parsed.data.reach && !parsed.data.read)) return { ok: false, message: "Nothing to change." };
    const { ids, reach, read } = parsed.data;

    const rows = await db
      .select({ entry: collectionEntry, c: collection, encrypted: publication.encrypted })
      .from(collectionEntry)
      .innerJoin(collection, eq(collection.id, collectionEntry.collectionId))
      .innerJoin(publication, eq(publication.id, collectionEntry.publicationId))
      .where(inArray(collectionEntry.id, ids));
    const roles = new Map<string, Awaited<ReturnType<typeof collectionRole>>>();
    for (const id of new Set(rows.map((r) => r.c.id))) roles.set(id, await collectionRole(uid, id));
    const mine = rows.filter(({ entry, c }) => canManageEntry(roles.get(c.id) ?? null, uid, entry));
    if (mine.length === 0) return NOT_ALLOWED;

    let noPassword = 0;
    let notDiscover = 0;
    let keptEncrypted = 0;
    let changed = 0;
    const log = new Map<string, { category: ChangeCategory; text: string; pubIds: string[] }>();
    const note = (category: ChangeCategory, text: string, pubId: string) => {
      const k = `${category}\u0000${text}`;
      log.set(k, { category, text, pubIds: [...(log.get(k)?.pubIds ?? []), pubId] });
    };
    for (const { entry, c, encrypted } of mine) {
      const set: Partial<typeof collectionEntry.$inferInsert> = {};
      let access = entry.access === "inherit" ? c.defaultAccess : entry.access;
      if (read) {
        if (read !== "password" && encrypted) keptEncrypted++;
        else if (read === "password" && !entry.passwordHash && !c.passwordHash) noPassword++;
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
      if (set.listing && set.listing !== entry.listing)
        await db.update(publication).set({ searchable: SEARCHABLE_FOR[set.listing] }).where(eq(publication.id, entry.publicationId));
      changed++;
      if (set.access && set.access !== entry.access)
        note("access", `Access in ${collectionLink(c)}: ${ACCESS_LABELS[set.access as (typeof ACCESS)[number]]}`, entry.publicationId);
      if (set.listing && set.listing !== entry.listing)
        note("listing", `${LISTING_LOG[set.listing]} in ${collectionLink(c)}`, entry.publicationId);
    }
    for (const { category, text, pubIds } of log.values()) await logForPublications(pubIds, category, text);
    for (const id of roles.keys()) await clearGatedCollectionDiscover(id);
    revalidateAll();

    const notes = [
      noPassword && `${plural(noPassword)} kept their access: set a collection password, or one per page, to use Password.`,
      notDiscover && `${plural(notDiscover)} can't go on Discover here, so they're listed instead.`,
      keptEncrypted && ENCRYPTED_KEPT(keptEncrypted),
    ].filter(Boolean);
    if (changed === 0) return { ok: false, message: notes.join(" ") || "Nothing changed." };
    return { ok: true, message: [`Updated ${plural(changed)}.`, ...notes].join(" ") };
  });
}
