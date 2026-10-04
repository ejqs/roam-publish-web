"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { ACCESS, collection, collectionEntry, VIEWS_MODE } from "@/db/schema";
import { auth } from "@/lib/auth";
import { logForPublications, roamInert } from "@/lib/changelog";
import { CollectionName, CollectionSlug, reservePath } from "@/lib/collections";
import { Description } from "@/lib/descriptions";
import { DISCOVER_TAG } from "@/lib/discover";
import { purgeCollection } from "@/lib/deletion";
import { clearGatedCollectionDiscover } from "@/lib/discover-rules";
import { pagesNeedingContainerPassword } from "@/lib/container-pages";
import { dropLock, KeysError, setLockPassword } from "@/lib/encryption";
import { hashPassword, Password } from "@/lib/gates";
import { canReceiveInvite } from "@/lib/graph-access";
import { rateLimit } from "@/lib/rate-limit";
import { withAction } from "@/lib/telemetry";

export type CollectionResult =
  | { ok: true; message: string; slug?: string }
  | { ok: false; message: string; needCurrentPassword?: boolean };

async function userId() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

const EXPIRED = { ok: false as const, message: "Your session expired. Please log in again." };

function revalidate() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/c/[id]", "layout");
  revalidatePath("/");
  updateTag(DISCOVER_TAG);
}

const Create = z.object({ slug: CollectionSlug, name: CollectionName });

/** Anyone who could be invited somewhere (verified email and their own graph) can start a collection. */
export async function createCollection(input: z.input<typeof Create>): Promise<CollectionResult> {
  return withAction("dashboard.collections.createCollection", async () => {
    const uid = await userId();
    if (!uid) return EXPIRED;
    if (!(await canReceiveInvite(uid)))
      return { ok: false, message: "Verify your email and connect a graph of your own first." };
    const parsed = Create.safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    if (!rateLimit(`collection:create:${uid}`, 10, 60 * 60 * 1000))
      return { ok: false, message: "Too many collections. Try again later." };
    const { slug, name } = parsed.data;
    const created = await db.transaction(async (tx) => {
      if (!(await reservePath(tx, slug, "collection"))) return false;
      await tx.insert(collection).values({ slug, name, ownerId: uid });
      return true;
    });
    if (!created) return { ok: false, message: "That address is taken." };
    revalidate();
    return { ok: true, message: `Created ${name}.`, slug };
  });
}

const Settings = z.object({
  name: CollectionName,
  description: Description,
  indexAccess: z.enum(ACCESS),
  defaultAccess: z.enum(ACCESS),
  showAuthors: z.boolean(),
  views: z.enum(VIEWS_MODE),
  showViewCountries: z.boolean(),
  indexable: z.boolean(),
  searchListed: z.boolean(),
  featured: z.boolean(),
  discoverable: z.boolean(),
  rss: z.boolean(),
  password: z.union([z.literal(""), Password]),
  clearPassword: z.boolean(),
  /** The password now, when a new one is set and encrypted pages use it. */
  currentPassword: z.string().max(200).optional(),
  /** Set the new password without the current one: pages encrypted with it need republishing. */
  resetEncrypted: z.boolean().optional(),
});
export type CollectionSettings = z.input<typeof Settings>;

export async function updateCollection(collectionId: string, input: CollectionSettings): Promise<CollectionResult> {
  return withAction("dashboard.collections.updateCollection", async () => {
    const uid = await userId();
    if (!uid) return EXPIRED;
    const parsed = Settings.safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const s = parsed.data;
    const c = await db.query.collection.findFirst({
      where: and(eq(collection.id, collectionId), eq(collection.ownerId, uid)),
    });
    if (!c) return { ok: false, message: "Collection not found." };
    const hasPassword = s.password ? true : s.clearPassword ? false : !!c.passwordHash;
    if ((s.indexAccess === "password" || s.defaultAccess === "password") && !hasPassword)
      return { ok: false, message: "Set a collection password to use password access." };
    if (!hasPassword && (await pagesNeedingContainerPassword("collection", c.id)))
      return { ok: false, message: "Some pages still use the collection password. Change them first." };
    // Discover only takes open, indexable collections; a gate turns it off (see clearGatedCollectionDiscover).
    const open = s.indexAccess === "open" && s.indexable;
    if ((s.password || s.currentPassword) && !rateLimit(`password:user:${uid}`, 30, 15 * 60 * 1000))
      return { ok: false, message: "Too many changes. Try again in a few minutes." };
    try {
    await db.transaction(async (tx) => {
    const lock = { scope: "collection", id: c.id, version: c.passwordVersion } as const;
    if (s.password) await setLockPassword(tx, lock, s.password, { currentPassword: s.currentPassword, reset: s.resetEncrypted });
    else if (s.clearPassword) await dropLock(tx, lock);
    // The default is for pages added from now on: pages that followed the old one keep it.
    if (s.defaultAccess !== c.defaultAccess)
      await tx
        .update(collectionEntry)
        .set({ access: c.defaultAccess })
        .where(and(eq(collectionEntry.collectionId, c.id), eq(collectionEntry.access, "inherit")));
    await tx
      .update(collection)
      .set({
        name: s.name,
        description: s.description,
        indexAccess: s.indexAccess,
        defaultAccess: s.defaultAccess,
        showAuthors: s.showAuthors,
        views: s.views,
        showViewCountries: s.showViewCountries,
        indexable: s.indexable,
        searchListed: s.searchListed,
        featured: s.featured && open && s.defaultAccess === "open",
        discoverable: s.discoverable && open,
        rss: s.rss,
        ...(s.password
          ? { passwordHash: hashPassword(s.password), passwordVersion: c.passwordVersion + 1 }
          : s.clearPassword
            ? { passwordHash: null, passwordVersion: c.passwordVersion + 1 }
            : {}),
      })
      .where(eq(collection.id, c.id));
    });
    } catch (e) {
      if (e instanceof KeysError) return { ok: false, message: e.message, needCurrentPassword: e.need === "currentPassword" };
      throw e;
    }
    await clearGatedCollectionDiscover(c.id);
    revalidate();
    return { ok: true, message: "Settings saved." };
  });
}

/** Deletes the collection and its entries. The pages stay published in their graphs. */
export async function deleteCollection(collectionId: string): Promise<CollectionResult> {
  return withAction("dashboard.collections.deleteCollection", async () => {
    const uid = await userId();
    if (!uid) return EXPIRED;
    const c = await db.query.collection.findFirst({
      where: and(eq(collection.id, collectionId), eq(collection.ownerId, uid)),
    });
    if (!c) return { ok: false, message: "Collection not found." };
    if (c.suspendedAt) return { ok: false, message: "A moderator suspended this collection." };
    const pages = await db
      .select({ id: collectionEntry.publicationId })
      .from(collectionEntry)
      .where(eq(collectionEntry.collectionId, c.id));
    await db.transaction((tx) => purgeCollection(tx, c, { keepSlug: false }));
    await logForPublications(pages.map((p) => p.id), "collections", `Collection "${roamInert(c.name)}" was deleted, so the page left it`);
    revalidate();
    return { ok: true, message: `Deleted ${c.name}.` };
  });
}

export async function moveEntry(entryId: string, direction: -1 | 1): Promise<CollectionResult> {
  return withAction("dashboard.collections.moveEntry", async () => {
    const uid = await userId();
    if (!uid) return EXPIRED;
    const entry = await db.query.collectionEntry.findFirst({ where: eq(collectionEntry.id, entryId) });
    if (!entry) return { ok: false, message: "Not found." };
    const c = await db.query.collection.findFirst({
      where: and(eq(collection.id, entry.collectionId), eq(collection.ownerId, uid)),
    });
    if (!c) return { ok: false, message: "Only the owner can reorder." };
    const all = await db
      .select({ id: collectionEntry.id, position: collectionEntry.position })
      .from(collectionEntry)
      .where(eq(collectionEntry.collectionId, c.id))
      .orderBy(collectionEntry.position, collectionEntry.addedAt);
    const i = all.findIndex((e) => e.id === entryId);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= all.length) return { ok: true, message: "" };
    [all[i], all[j]] = [all[j], all[i]];
    await db.transaction(async (tx) => {
      for (const [position, e] of all.entries())
        await tx.update(collectionEntry).set({ position }).where(eq(collectionEntry.id, e.id));
    });
    revalidate();
    return { ok: true, message: "" };
  });
}
