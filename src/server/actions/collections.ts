"use server";

import "server-only";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { collection, collectionEntry } from "@/db/schema";
import { auth } from "@/lib/auth";
import { logForPublications, roamInert } from "@/lib/changelog";
import { CollectionName, CollectionSlug, reservePath } from "@/lib/collections";
import { purgeCollection } from "@/lib/deletion";
import { canReceiveInvite } from "@/lib/graph-access";
import { rateLimit } from "@/lib/rate-limit";
import { deleteCollectionBlocked } from "@/lib/pins";
import { withAction } from "@/lib/telemetry";

import { type CollectionResult, type CollectionSettings, revalidate, updateCollectionAs } from "@/lib/collection-edits";

export type { CollectionResult, CollectionSettings } from "@/lib/collection-edits";

async function userId() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

const EXPIRED = { ok: false as const, message: "Your session expired. Please log in again." };


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

export async function updateCollection(collectionId: string, input: CollectionSettings): Promise<CollectionResult> {
  return withAction("dashboard.collections.updateCollection", async () => {
    const uid = await userId();
    if (!uid) return EXPIRED;
    return updateCollectionAs(uid, collectionId, input);
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
    const pinned = await deleteCollectionBlocked(c);
    if (pinned) return { ok: false, message: pinned };
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
