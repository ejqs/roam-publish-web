import "server-only";
import { and, eq } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  ACCESS,
  collection,
  collectionEntry,
  ENTRY_LISTING,
  graph,
  PLACE_ACCESS,
  PLACE_PDF,
  PLACE_VIEWS,
  publication,
  SHOW_AUTHOR,
} from "@/db/schema";
import { ACCESS_LABELS } from "@/components/manage/labels";
import { type Change, logChange, logChanges, logForPublications, roamInert } from "@/lib/changelog";
import { canManageEntry, collectionRole } from "@/lib/collections";
import { DISCOVER_TAG } from "@/lib/discover";
import { clearGatedCollectionDiscover, clearGatedGraphDiscover } from "@/lib/discover-rules";
import { entryDiscoverBlocked, hideFromGraphBlocked } from "@/lib/control-rules";
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
import { collectionUrl } from "@/lib/publications";
import { rateLimit } from "@/lib/rate-limit";
import { placeChangeBlocked } from "@/lib/pin-rules";
import { pinOf } from "@/lib/pins";

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

export function revalidateAll() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/[graph]", "layout");
  revalidatePath("/c/[id]", "layout");
  revalidatePath("/u/[username]", "page");
  revalidatePath("/");
  updateTag(DISCOVER_TAG);
}

export const PlaceInput = z.object({
  access: z.enum(PLACE_ACCESS).optional(),
  showAuthor: z.enum(SHOW_AUTHOR).optional(),
  views: z.enum(PLACE_VIEWS).optional(),
  showViewCountries: z.enum(SHOW_AUTHOR).optional(),
  pdfDownload: z.enum(PLACE_PDF).optional(),
  /** A new password for this page only. */
  password: Password.optional(),
  /** Drop this page's own password, so password access falls back to its graph's or collection's. */
  clearPassword: z.boolean().optional(),
  /** For an encrypted page: a password that opens it now, when the change needs its content key. */
  currentPassword: z.string().max(200).optional(),
});
export type PlaceInput = z.input<typeof PlaceInput>;

export const LISTING_LOG = { unlisted: "Unlisted", listed: "Public", discover: "On Discover" } as const;

export const SESSION_EXPIRED: PlaceResult = { ok: false, message: "Your session expired. Please log in again." };
export const NOT_ALLOWED: PlaceResult = { ok: false, message: "You can't change this page." };
export const NEEDS_PASSWORD = (where: string) =>
  `Set a password for this page, or give the ${where} a password in its settings.`;

const accessLabel = (a: (typeof PLACE_ACCESS)[number], fallback: (typeof ACCESS)[number]) =>
  a === "inherit" ? `${ACCESS_LABELS[fallback]} (default)` : ACCESS_LABELS[a];
// The collection's owner may be outside the page's graph, so its name goes into Roam inert.
export const collectionLink = (c: { name: string; slug: string }) => `[${roamInert(c.name) || c.slug}](${collectionUrl(c.slug)})`;

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
export async function withKeys(fn: () => Promise<PlaceResult>): Promise<PlaceResult> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof KeysError) return { ok: false, message: e.message, needCurrentPassword: e.need === "currentPassword" };
    throw e;
  }
}

/** The content key of an encrypted page, opened before a change that could stop the viewer's cookie fitting. */
export async function preKey(pub: { id: string; encrypted: boolean }, currentPassword?: string) {
  return pub.encrypted ? contentKeyFor(db, pub, { passwords: currentPassword ? [currentPassword] : [] }) : null;
}

export const triesLeft = (uid: string, input: { password?: string; currentPassword?: string }) =>
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
export async function updateGraphPlaceAs(uid: string, publicationId: string,
  raw: PlaceInput & { inGraph?: boolean },): Promise<PlaceResult> {
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

  if (pub.inGraph) {
    const before = pub.access === "inherit" ? g.defaultAccess : pub.access;
    const pinned = placeChangeBlocked(g.name, await pinOf({ kind: "page", publicationId: pub.id }), {
      removing: input.inGraph === false,
      from: before,
      to: effective,
      passwordChanges: before === "password" && effective === "password" && !!(input.password || input.clearPassword),
    });
    if (pinned) return { ok: false, message: pinned };
  }

  if (input.inGraph === false) {
    const inCollections = await db.query.collectionEntry.findFirst({
      where: eq(collectionEntry.publicationId, pub.id),
    });
    const blocked = hideFromGraphBlocked(inCollections ? 1 : 0);
    if (blocked) return { ok: false, message: blocked };
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
          ...(input.pdfDownload && { pdfDownload: input.pdfDownload }),
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
}

/** A page's place in a collection. Collection owners manage every entry; members their own. */
export async function updateEntryAs(uid: string, entryId: string,
  raw: PlaceInput & { listing?: (typeof ENTRY_LISTING)[number] },): Promise<PlaceResult> {
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
  const before = entry.access === "inherit" ? c.defaultAccess : entry.access;
  const pinned = placeChangeBlocked(c.name, await pinOf({ kind: "entry", entryId: entry.id }), {
    from: before,
    to: effective,
    passwordChanges: before === "password" && effective === "password" && !!(input.password || input.clearPassword),
  });
  if (pinned) return { ok: false, message: pinned };
  const listing = input.listing ?? entry.listing;
  const notDiscover = listing === "discover" && entryDiscoverBlocked(effective, { ...c, suspended: !!c.suspendedAt });
  if (notDiscover) return { ok: false, message: notDiscover };

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
          ...(input.pdfDownload && { pdfDownload: input.pdfDownload }),
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
}

/**
 * Takes a page out of a collection: by whoever manages the entry, or whoever manages the page.
 * A page can't be left with no place at all; unpublish it instead.
 */
export async function removeEntryAs(uid: string, entryId: string, currentPassword?: string): Promise<PlaceResult> {
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
  const pinned = placeChangeBlocked(c?.name ?? "this collection", await pinOf({ kind: "entry", entryId: entry.id }), { removing: true });
  if (pinned) return { ok: false, message: pinned };
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
}
