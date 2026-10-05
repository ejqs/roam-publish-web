import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { collection, collectionEntry, graph, publication } from "@/db/schema";

/**
 * Password protection and membership never go together with Discover. These run after any change
 * to a page's access or a container's defaults, so nothing gated stays listed there.
 */

/** Clears Discover on this graph's pages that are no longer open to everyone. */
export async function clearGatedGraphDiscover(graphId: string) {
  const g = await db.query.graph.findFirst({ where: eq(graph.id, graphId) });
  if (!g) return;
  const allGated = g.indexAccess !== "open";
  await db
    .update(publication)
    .set({ discoverable: false })
    .where(
      and(
        eq(publication.graphId, graphId),
        eq(publication.discoverable, true),
        allGated
          ? sql`true`
          : sql`not (${publication.access} = 'open' or (${publication.access} = 'inherit' and ${g.defaultAccess} = 'open'))`,
      ),
    );
}

/**
 * Moves this collection's gated Discover entries back to "listed". A collection that isn't open,
 * or isn't indexable, can't list itself or its pages on Discover at all.
 */
export async function clearGatedCollectionDiscover(collectionId: string) {
  const c = await db.query.collection.findFirst({ where: eq(collection.id, collectionId) });
  if (!c) return;
  const allOff = c.indexAccess !== "open" || !c.indexable || !!c.suspendedAt;
  await db
    .update(collectionEntry)
    .set({ listing: "listed" })
    .where(
      and(
        eq(collectionEntry.collectionId, collectionId),
        eq(collectionEntry.listing, "discover"),
        allOff
          ? sql`true`
          : sql`not (${collectionEntry.access} = 'open' or (${collectionEntry.access} = 'inherit' and ${c.defaultAccess} = 'open'))`,
      ),
    );
  if (allOff) await db.update(collection).set({ discoverable: false }).where(eq(collection.id, collectionId));
}

