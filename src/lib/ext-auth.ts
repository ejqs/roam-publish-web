import { eq } from "drizzle-orm";
import { db } from "@/db";
import { graph, user } from "@/db/schema";
import { auth } from "./auth";
import { json } from "./cors";

export type ExtContext = { userId: string; graphId: string; graphName: string };

/**
 * Resolves the x-api-key header to the user + graph it was issued for, or the error response to
 * return: 401 for a bad key or a banned owner, 403 for a graph a moderator suspended.
 */
export async function requireExtKey(req: Request): Promise<ExtContext | Response> {
  const invalid = () => json(req, { error: "Invalid API key" }, 401);
  const key = req.headers.get("x-api-key");
  if (!key) return invalid();
  const res = await auth.api.verifyApiKey({ body: { key } }).catch(() => null);
  if (!res?.valid || !res.key) return invalid();
  const graphId = (res.key.metadata as { graphId?: string } | null)?.graphId;
  if (!graphId) return invalid();
  const [row] = await db
    .select({ g: graph, banned: user.banned })
    .from(graph)
    .innerJoin(user, eq(user.id, graph.userId))
    .where(eq(graph.id, graphId))
    .limit(1);
  if (!row || row.g.userId !== res.key.referenceId) return invalid();
  if (row.banned) return json(req, { error: "This account has been suspended" }, 401);
  if (row.g.suspendedAt)
    return json(req, { error: "This graph was suspended by a moderator", reason: row.g.suspendedReason }, 403);
  return { userId: row.g.userId, graphId: row.g.id, graphName: row.g.name };
}

export function removedResponse(req: Request, reason: string | null) {
  return json(req, { error: "This page was removed by a moderator", reason }, 403);
}
