import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { graph, graphMember, publication, user } from "@/db/schema";
import { auth } from "./auth";
import { json } from "./cors";
import type { GraphRole } from "./graph-access";
import { keyGraphId } from "./keys";

export type ExtContext = {
  /** Whose key this is: the owner or a member. */
  userId: string;
  ownerId: string;
  role: GraphRole;
  graphId: string;
  graphName: string;
};

/**
 * Resolves the x-api-key header to the person and graph it was issued for, or the error response to
 * return: 401 for a bad key, a banned key holder or owner, or someone no longer in the graph; 403
 * for a graph a moderator suspended; 409 when the extension says it's running in a different graph
 * than the key's; 429 once the key has made too many requests this minute.
 */
export async function requireExtKey(req: Request): Promise<ExtContext | Response> {
  const invalid = () => json(req, { error: "Invalid API key" }, 401);
  const key = req.headers.get("x-api-key");
  if (!key) return invalid();
  const res = await auth.api.verifyApiKey({ body: { key } }).catch(() => null);
  // A busy key is still a good key: say so, or the extension tells people to replace it.
  if (res?.error?.code === "RATE_LIMITED") {
    const ms = Number((res.error as { details?: { tryAgainIn?: number } }).details?.tryAgainIn) || 60_000;
    const secs = Math.max(1, Math.ceil(ms / 1000));
    const r = json(req, { error: `Too many requests with this API key. Try again in ${secs} seconds.` }, 429);
    r.headers.set("retry-after", String(secs));
    return r;
  }
  if (!res?.valid || !res.key) return invalid();
  const graphId = keyGraphId(res.key.metadata);
  if (!graphId) return invalid();
  const holderId = res.key.referenceId;
  const [row] = await db
    .select({ g: graph, ownerBanned: user.banned })
    .from(graph)
    .innerJoin(user, eq(user.id, graph.userId))
    .where(eq(graph.id, graphId))
    .limit(1);
  if (!row) return invalid();

  let role: GraphRole;
  if (row.g.userId === holderId) role = "owner";
  else {
    const m = await db.query.graphMember.findFirst({
      where: and(eq(graphMember.graphId, graphId), eq(graphMember.userId, holderId)),
    });
    if (!m) return invalid();
    role = "member";
  }
  const holder =
    role === "owner"
      ? { banned: row.ownerBanned }
      : await db.query.user.findFirst({ where: eq(user.id, holderId), columns: { banned: true } });
  if (holder?.banned || row.ownerBanned) return json(req, { error: "This account has been suspended" }, 401);
  if (row.g.suspendedAt)
    return json(req, { error: "This graph was suspended by a moderator", reason: row.g.suspendedReason }, 403);
  // The extension says which Roam graph it's in; a key pasted into another graph would otherwise
  // publish that graph's pages under this one's name. Older extensions don't send it.
  const inGraph = req.headers.get("x-roam-graph");
  if (inGraph !== null && inGraph !== row.g.name) return wrongGraphResponse(req, row.g.name, inGraph);
  return { userId: holderId, ownerId: row.g.userId, role, graphId: row.g.id, graphName: row.g.name };
}

export function wrongGraphResponse(req: Request, keyGraph: string, inGraph: string) {
  return json(
    req,
    {
      error: `This API key is for the graph ${keyGraph}, but you're in ${inGraph}. Each graph has its own key: open Settings → Roam Publish → Open dashboard to get the key for ${inGraph}.`,
      keyGraph,
    },
    409,
  );
}

export function removedResponse(req: Request, reason: string | null) {
  return json(req, { error: "This page was removed by a moderator", reason }, 403);
}

export function notYoursResponse(req: Request) {
  return json(
    req,
    { error: "Only the person who published this page or the graph owner can change it" },
    403,
  );
}

/**
 * The page this key may change, or the error to return: 404 not published, 403 removed by a
 * moderator, 403 published by another member.
 */
export async function ownPage(req: Request, ctx: ExtContext, rootUid: string) {
  const pub = await db.query.publication.findFirst({
    where: and(eq(publication.graphId, ctx.graphId), eq(publication.rootUid, rootUid)),
  });
  if (!pub) return json(req, { error: "Not published" }, 404);
  // A removed page stays put, so deleting and republishing can't get around the takedown.
  if (pub.removedAt) return removedResponse(req, pub.removedReason);
  if (ctx.role !== "owner" && pub.publishedBy !== ctx.userId) return notYoursResponse(req);
  return pub;
}
