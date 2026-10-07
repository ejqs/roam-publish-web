import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";
import { db } from "@/db";
import { collection, collectionEntry, collectionMember, cPath, graph, publication, user } from "@/db/schema";
import { randomId } from "./random-id";

const RESERVED = new Set(["new", "admin", "api", "settings", "discover", "collection", "collections"]);

/** Collection slugs: case-insensitive, stored lowercase, so /c/Reading-Group and /c/reading-group are the same. */
export const CollectionSlug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_-]{2,39}$/, "3–40 characters: letters, numbers, - and _. Start with a letter or number.")
  .refine((s) => !RESERVED.has(s), "That name is reserved.");

export const CollectionName = z.string().trim().min(1, "Give it a name.").max(80, "Keep the name under 80 characters.");

export type CollectionRole = "owner" | "member";

export async function collectionRole(userId: string, collectionId: string): Promise<CollectionRole | null> {
  const c = await db.query.collection.findFirst({
    where: eq(collection.id, collectionId),
    columns: { ownerId: true },
  });
  if (!c) return null;
  if (c.ownerId === userId) return "owner";
  const m = await db.query.collectionMember.findFirst({
    where: and(eq(collectionMember.collectionId, collectionId), eq(collectionMember.userId, userId)),
  });
  return m ? "member" : null;
}

/** Collections this person owns or belongs to, owned first. */
export const collectionsOf = cache(async (userId: string) => {
  const [owned, joined] = await Promise.all([
    db.select().from(collection).where(eq(collection.ownerId, userId)).orderBy(collection.name),
    db
      .select({ c: collection })
      .from(collectionMember)
      .innerJoin(collection, eq(collection.id, collectionMember.collectionId))
      .where(eq(collectionMember.userId, userId))
      .orderBy(collection.name),
  ]);
  return [
    ...owned.map((c) => ({ ...c, role: "owner" as CollectionRole })),
    ...joined.map(({ c }) => ({ ...c, role: "member" as CollectionRole })),
  ];
});

/** Owners manage every entry; members manage the ones they added. */
export const canManageEntry = (role: CollectionRole | null, userId: string, entry: { addedBy: string | null }) =>
  role === "owner" || (role === "member" && entry.addedBy === userId);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Claims a path under /c/. False when a collection or entry already has it. */
export async function reservePath(tx: Tx, path: string, kind: "collection" | "entry") {
  const rows = await tx.insert(cPath).values({ path, kind }).onConflictDoNothing().returning();
  return rows.length > 0;
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const randomUid = () => randomId(ALPHABET, 10);

/**
 * Adds a publication to a collection with a fresh /c/{entryUid}. The uid is random, never derived
 * from the Roam uid, so pages from different graphs can't clash. The origin graph and uid are kept
 * for the dashboard. Returns null when the page is already in the collection.
 */
export async function addEntry(
  collectionId: string,
  publicationId: string,
  addedBy: string,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ pub: publication, graphName: graph.name, featured: collection.featured, defaultAccess: collection.defaultAccess, open: sql<boolean>`${collection.indexAccess} = 'open' and ${collection.defaultAccess} = 'open'` })
      .from(publication)
      .innerJoin(graph, eq(graph.id, publication.graphId))
      .innerJoin(collection, eq(collection.id, collectionId))
      .where(eq(publication.id, publicationId))
      .limit(1);
    if (!row) return null;
    const existing = await tx.query.collectionEntry.findFirst({
      where: and(eq(collectionEntry.collectionId, collectionId), eq(collectionEntry.publicationId, publicationId)),
    });
    if (existing) return null;
    let entryUid = randomUid();
    for (let i = 0; !(await reservePath(tx, entryUid, "entry")); i++) {
      if (i > 5) throw new Error("Couldn't find a free entry uid");
      entryUid = randomUid();
    }
    const [{ max }] = await tx
      .select({ max: sql<number>`coalesce(max(${collectionEntry.position}), -1)`.mapWith(Number) })
      .from(collectionEntry)
      .where(eq(collectionEntry.collectionId, collectionId));
    const [entry] = await tx
      .insert(collectionEntry)
      .values({
        collectionId,
        publicationId,
        entryUid,
        // New pages start from the collection's Discover default.
        listing: row.featured && row.open ? "discover" : "listed",
        // Who can read starts as the collection's current default, like a new graph page.
        access: row.defaultAccess,
        addedBy,
        position: max + 1,
        originGraphName: row.graphName,
        originRootUid: row.pub.rootUid,
      })
      .returning();
    return entry;
  });
}

/** What /c/{id} points at: a collection by slug or an entry by uid. Both are lowercase. */
export const resolveC = cache(async (raw: string) => {
  const id = raw.toLowerCase();
  const path = await db.query.cPath.findFirst({ where: eq(cPath.path, id) });
  if (!path) return null;
  if (path.kind === "collection") {
    const c = await loadCollection(id);
    return c ? ({ kind: "collection", c } as const) : null;
  }
  const entry = await db.query.collectionEntry.findFirst({ where: eq(collectionEntry.entryUid, id) });
  if (!entry) return null;
  const c = await loadCollectionById(entry.collectionId);
  const [row] = await db
    .select({ pub: publication, g: graph, banned: user.banned })
    .from(publication)
    .innerJoin(graph, eq(graph.id, publication.graphId))
    .innerJoin(user, eq(user.id, graph.userId))
    .where(eq(publication.id, entry.publicationId))
    .limit(1);
  if (!c || !row) return null;
  const graphTakenDown = !!row.g.suspendedAt || !!row.banned;
  return { kind: "entry", c, entry, pub: row.pub, g: row.g, graphTakenDown } as const;
});

const withTakedown = async (c: typeof collection.$inferSelect | undefined) => {
  if (!c) return undefined;
  const owner = await db.query.user.findFirst({ where: eq(user.id, c.ownerId), columns: { banned: true } });
  return { ...c, takenDown: !!c.suspendedAt || !!owner?.banned };
};

export const loadCollection = cache(async (slug: string) =>
  withTakedown(await db.query.collection.findFirst({ where: eq(collection.slug, slug.toLowerCase()) })),
);

export const loadCollectionById = cache(async (id: string) =>
  withTakedown(await db.query.collection.findFirst({ where: eq(collection.id, id) })),
);
