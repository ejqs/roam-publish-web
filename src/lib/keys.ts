import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apikey } from "@/db/schema";
import { auth } from "./auth";
import { keyGraphId } from "./key-metadata";

export { keyGraphId };

/** A person's keys, each with the graph it's for. A person has at most one per graph. */
export async function keysOf(userId: string) {
  const rows = await db
    .select({
      id: apikey.id,
      start: apikey.start,
      metadata: apikey.metadata,
      createdAt: apikey.createdAt,
      lastRequest: apikey.lastRequest,
    })
    .from(apikey)
    .where(eq(apikey.referenceId, userId));
  return rows.map(({ metadata, ...k }) => ({ ...k, graphId: keyGraphId(metadata) }));
}

/** Deletes every key this person holds for this graph. */
export async function revokeKeys(userId: string, graphId: string) {
  const ids = (await keysOf(userId)).filter((k) => k.graphId === graphId).map((k) => k.id);
  for (const id of ids) await db.delete(apikey).where(eq(apikey.id, id));
  return ids.length;
}

/**
 * Replaces this person's key for this graph and returns the new key. Only its hash is stored, so this
 * is the one time it can be shown. Callers check that the person owns or belongs to the graph.
 */
export async function issueKey(userId: string, graphId: string, graphName: string) {
  await revokeKeys(userId, graphId);
  const key = await auth.api.createApiKey({
    body: { userId, name: graphName.slice(0, 32), metadata: { graphId } },
  });
  return key.key;
}
