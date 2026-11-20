import "server-only";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { collection, collectionEntry, graph, linkPin, publication } from "@/db/schema";
import { canManageEntry, collectionRole } from "@/lib/collections";
import { manageablePublications } from "@/lib/graph-access";
import { parseSharedAt, type PinTarget } from "@/lib/pin-rules";

/**
 * Pinning and unpinning a link (pin-rules.ts says what a pin refuses), for the dashboard's server
 * actions and the extension's routes alike, so both check the same permission and save the same way.
 */

export type PinResult = { ok: boolean; message: string };

export const PIN_NOT_ALLOWED: PinResult = { ok: false, message: "You can't change this link." };

/**
 * Whoever can change a link can pin or unpin it: the page's link in its graph by whoever manages the
 * page; its link in a collection by whoever manages that entry or the page; a front page by the graph's
 * owner; a collection's page by its owner. A collection's owner can unpin a member's page there, so a
 * pin never stops them tidying their collection.
 */
export async function mayChangePin(uid: string, t: PinTarget) {
  if (t.kind === "page") {
    const [row] = await db
      .select({ id: publication.id })
      .from(publication)
      .where(and(eq(publication.id, t.publicationId), manageablePublications(uid), eq(publication.inGraph, true)))
      .limit(1);
    return !!row;
  }
  if (t.kind === "entry") {
    const entry = await db.query.collectionEntry.findFirst({ where: eq(collectionEntry.id, t.entryId) });
    if (!entry) return false;
    if (canManageEntry(await collectionRole(uid, entry.collectionId), uid, entry)) return true;
    const [pub] = await db
      .select({ id: publication.id })
      .from(publication)
      .where(and(eq(publication.id, entry.publicationId), manageablePublications(uid)))
      .limit(1);
    return !!pub;
  }
  if (t.kind === "front") {
    const g = await db.query.graph.findFirst({ where: and(eq(graph.id, t.graphId), eq(graph.userId, uid)), columns: { id: true } });
    return !!g;
  }
  const c = await db.query.collection.findFirst({
    where: and(eq(collection.id, t.collectionId), eq(collection.ownerId, uid)),
    columns: { id: true },
  });
  return !!c;
}

const column = (t: PinTarget) =>
  t.kind === "page"
    ? { publicationId: t.publicationId }
    : t.kind === "entry"
      ? { entryId: t.entryId }
      : t.kind === "front"
        ? { graphId: t.graphId }
        : { collectionId: t.collectionId };

const match = (t: PinTarget) =>
  t.kind === "page"
    ? eq(linkPin.publicationId, t.publicationId)
    : t.kind === "entry"
      ? eq(linkPin.entryId, t.entryId)
      : t.kind === "front"
        ? eq(linkPin.graphId, t.graphId)
        : eq(linkPin.collectionId, t.collectionId);

function revalidate() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/[graph]", "layout");
  revalidatePath("/c/[id]", "layout");
}

/**
 * Pins a link, or changes where it says it's shared. `places` is the pasted text, one URL per line.
 * The caller has already checked `mayChangePin`.
 */
export async function savePin(uid: string, t: PinTarget, places: string): Promise<PinResult> {
  const urls = parseSharedAt(places);
  if ("error" in urls) return { ok: false, message: urls.error };
  const updated = await db.update(linkPin).set({ sharedAt: urls.urls }).where(match(t)).returning({ id: linkPin.id });
  if (updated.length === 0)
    await db
      .insert(linkPin)
      .values({ ...column(t), sharedAt: urls.urls, pinnedBy: uid })
      .onConflictDoNothing();
  revalidate();
  return { ok: true, message: updated.length ? "Saved where it's shared." : "Link pinned." };
}

/** Unpins a link: everything it refused works again. The caller has already checked `mayChangePin`. */
export async function removePin(t: PinTarget): Promise<PinResult> {
  await db.delete(linkPin).where(match(t));
  revalidate();
  return { ok: true, message: "Link unpinned." };
}
