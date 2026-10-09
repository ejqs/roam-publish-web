"use server";

import "server-only";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { collection, collectionEntry, graph, linkPin, publication } from "@/db/schema";
import { auth } from "@/lib/auth";
import { canManageEntry, collectionRole } from "@/lib/collections";
import { manageablePublications } from "@/lib/graph-access";
import { parseSharedAt, type PinTarget } from "@/lib/pin-rules";
import { withAction } from "@/lib/telemetry";

export type PinResult = { ok: boolean; message: string };

const Target = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("page"), publicationId: z.string() }),
  z.object({ kind: z.literal("entry"), entryId: z.string() }),
  z.object({ kind: z.literal("front"), graphId: z.string() }),
  z.object({ kind: z.literal("collection"), collectionId: z.string() }),
]);

const NOT_ALLOWED: PinResult = { ok: false, message: "You can't change this link." };

/**
 * Whoever can change a link can pin or unpin it: the page's link in its graph by whoever manages the
 * page; its link in a collection by whoever manages that entry or the page; a front page by the graph's
 * owner; a collection's page by its owner. A collection's owner can unpin a member's page there, so a
 * pin never stops them tidying their collection.
 */
async function mayChange(uid: string, t: PinTarget) {
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

async function userId() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

/** Pins a link, or changes where it says it's shared. `places` is the pasted text, one URL per line. */
export async function pinLink(raw: PinTarget, places: string): Promise<PinResult> {
  return withAction("dashboard.pins.pinLink", async () => {
    const uid = await userId();
    if (!uid) return { ok: false, message: "Your session expired. Please log in again." };
    const parsed = Target.safeParse(raw);
    if (!parsed.success || typeof places !== "string" || places.length > 30_000) return NOT_ALLOWED;
    const t = parsed.data;
    if (!(await mayChange(uid, t))) return NOT_ALLOWED;
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
  });
}

/** Unpins a link: everything it refused works again. */
export async function unpinLink(raw: PinTarget): Promise<PinResult> {
  return withAction("dashboard.pins.unpinLink", async () => {
    const uid = await userId();
    if (!uid) return { ok: false, message: "Your session expired. Please log in again." };
    const parsed = Target.safeParse(raw);
    if (!parsed.success) return NOT_ALLOWED;
    const t = parsed.data;
    if (!(await mayChange(uid, t))) return NOT_ALLOWED;
    await db.delete(linkPin).where(match(t));
    revalidate();
    return { ok: true, message: "Link unpinned." };
  });
}
