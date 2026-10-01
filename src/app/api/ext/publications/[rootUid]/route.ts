import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { publication } from "@/db/schema";
import { json, preflight } from "@/lib/cors";
import { removedResponse, requireExtKey } from "@/lib/ext-auth";
import { publicationUrl } from "@/lib/publications";

export const OPTIONS = preflight;

export async function DELETE(
  req: Request,
  { params }: RouteContext<"/api/ext/publications/[rootUid]">,
) {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  const { rootUid } = await params;
  const target = and(eq(publication.graphId, ctx.graphId), eq(publication.rootUid, rootUid));
  // A removed page stays put, so deleting and republishing can't get around the takedown.
  const deleted = await db
    .delete(publication)
    .where(and(target, isNull(publication.removedAt)))
    .returning({ id: publication.id });
  if (deleted.length === 0) {
    const removed = await db.query.publication.findFirst({ where: target });
    if (removed) return removedResponse(req, removed.removedReason);
    return json(req, { error: "Not published" }, 404);
  }
  return json(req, { deleted: true });
}

const PatchBody = z.object({ visibility: z.enum(["public", "unlisted"]) });

export async function PATCH(
  req: Request,
  { params }: RouteContext<"/api/ext/publications/[rootUid]">,
) {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(req, { error: "Invalid visibility" }, 400);
  const { rootUid } = await params;
  const target = and(eq(publication.graphId, ctx.graphId), eq(publication.rootUid, rootUid));
  const [updated] = await db
    .update(publication)
    .set({ visibility: parsed.data.visibility })
    .where(and(target, isNull(publication.removedAt)))
    .returning({ title: publication.title, visibility: publication.visibility });
  if (!updated) {
    const removed = await db.query.publication.findFirst({ where: target });
    if (removed) return removedResponse(req, removed.removedReason);
    return json(req, { error: "Not published" }, 404);
  }
  return json(req, {
    visibility: updated.visibility,
    url: publicationUrl(ctx.graphName, rootUid, updated.title),
  });
}
