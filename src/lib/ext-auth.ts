import { eq } from "drizzle-orm";
import { db } from "@/db";
import { graph } from "@/db/schema";
import { auth } from "./auth";

export type ExtContext = { userId: string; graphId: string; graphName: string };

/** Resolves the x-api-key header to the user + graph it was issued for. */
export async function verifyExtKey(req: Request): Promise<ExtContext | null> {
  const key = req.headers.get("x-api-key");
  if (!key) return null;
  const res = await auth.api.verifyApiKey({ body: { key } }).catch(() => null);
  if (!res?.valid || !res.key) return null;
  const graphId = (res.key.metadata as { graphId?: string } | null)?.graphId;
  if (!graphId) return null;
  const g = await db.query.graph.findFirst({ where: eq(graph.id, graphId) });
  if (!g || g.userId !== res.key.referenceId) return null;
  return { userId: g.userId, graphId: g.id, graphName: g.name };
}
