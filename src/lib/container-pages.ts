import "server-only";
import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { collectionEntry, publication } from "@/db/schema";

/**
 * Pages in a graph or collection that are set to password access (on their own, not via the
 * default) without a password of their own, so they rely on the container's password.
 */
export async function pagesNeedingContainerPassword(kind: "graph" | "collection", id: string) {
  const [row] =
    kind === "graph"
      ? await db
          .select({ n: count() })
          .from(publication)
          .where(and(eq(publication.graphId, id), eq(publication.access, "password"), isNull(publication.passwordHash)))
      : await db
          .select({ n: count() })
          .from(collectionEntry)
          .where(
            and(
              eq(collectionEntry.collectionId, id),
              eq(collectionEntry.access, "password"),
              isNull(collectionEntry.passwordHash),
            ),
          );
  return row?.n ?? 0;
}
