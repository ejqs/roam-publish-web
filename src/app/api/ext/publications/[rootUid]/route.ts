import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { publication } from "@/db/schema";
import { json, preflight } from "@/lib/cors";
import { verifyExtKey } from "@/lib/ext-auth";

export const OPTIONS = preflight;

export async function DELETE(
  req: Request,
  { params }: RouteContext<"/api/ext/publications/[rootUid]">,
) {
  const ctx = await verifyExtKey(req);
  if (!ctx) return json(req, { error: "Invalid API key" }, 401);
  const { rootUid } = await params;
  const deleted = await db
    .delete(publication)
    .where(and(eq(publication.graphId, ctx.graphId), eq(publication.rootUid, rootUid)))
    .returning({ id: publication.id });
  if (deleted.length === 0) return json(req, { error: "Not published" }, 404);
  return json(req, { deleted: true });
}
