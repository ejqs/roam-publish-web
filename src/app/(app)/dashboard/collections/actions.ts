"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { ACCESS, collection, collectionEntry, cPath } from "@/db/schema";
import { auth } from "@/lib/auth";
import { logForPublications } from "@/lib/changelog";
import { CollectionName, CollectionSlug, reservePath } from "@/lib/collections";
import { Description } from "@/lib/descriptions";
import { DISCOVER_TAG } from "@/lib/discover";
import { clearGatedCollectionDiscover } from "@/lib/discover-rules";
import { pagesNeedingContainerPassword } from "@/lib/container-pages";
import { hashPassword, Password } from "@/lib/gates";
import { canReceiveInvite } from "@/lib/graph-access";
import { rateLimit } from "@/lib/rate-limit";

export type CollectionResult = { ok: true; message: string; slug?: string } | { ok: false; message: string };

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
}

const Settings = z.object({
  name: CollectionName,
  description: Description,
  indexAccess: z.enum(ACCESS),
  defaultAccess: z.enum(ACCESS),
  showAuthors: z.boolean(),
  indexable: z.boolean(),
  featured: z.boolean(),
  discoverable: z.boolean(),
  rss: z.boolean(),
  password: z.union([z.literal(""), Password]),
  clearPassword: z.boolean(),
});
export type CollectionSettings = z.input<typeof Settings>;

export async function updateCollection(collectionId: string, input: CollectionSettings): Promise<CollectionResult> {
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
  // The default is for pages added from now on: pages that followed the old one keep it.
  if (s.defaultAccess !== c.defaultAccess)
    await db
      .update(collectionEntry)
      .set({ access: c.defaultAccess })
      .where(and(eq(collectionEntry.collectionId, c.id), eq(collectionEntry.access, "inherit")));
  await db
    .update(collection)
    .set({
      name: s.name,
      description: s.description,
      indexAccess: s.indexAccess,
      defaultAccess: s.defaultAccess,
      showAuthors: s.showAuthors,
      indexable: s.indexable,
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
  await clearGatedCollectionDiscover(c.id);
  revalidate();
  return { ok: true, message: "Settings saved." };
}

/** Deletes the collection and its entries. The pages stay published in their graphs. */
export async function deleteCollection(collectionId: string): Promise<CollectionResult> {
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
  await db.transaction(async (tx) => {
    // Pages that were only in this collection go back to their graphs, unlisted.
    await tx.execute(sql`
      update publication set in_graph = true, visibility = 'unlisted'
      where in_graph = false
        and id in (select publication_id from collection_entry where collection_id = ${c.id})
        and not exists (
          select 1 from collection_entry e where e.publication_id = publication.id and e.collection_id <> ${c.id}
        )
    `);
    await tx.delete(collectionEntry).where(eq(collectionEntry.collectionId, c.id));
    await tx.delete(collection).where(eq(collection.id, c.id));
    // The slug is free again; entry uids stay reserved so old links never point at something new.
    await tx.delete(cPath).where(eq(cPath.path, c.slug));
  });
  await logForPublications(pages.map((p) => p.id), `Collection "${c.name}" was deleted, so the page left it`);
  revalidate();
  return { ok: true, message: `Deleted ${c.name}.` };
}

export async function moveEntry(entryId: string, direction: -1 | 1): Promise<CollectionResult> {
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
}
