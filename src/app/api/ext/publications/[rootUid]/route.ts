import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { publication } from "@/db/schema";
import { json, preflight } from "@/lib/cors";
import { type ExtContext, notYoursResponse, removedResponse, requireExtKey } from "@/lib/ext-auth";
import { primaryUrls } from "@/lib/places";

export const OPTIONS = preflight;

/**
 * The page this key may change, or the error to return: 404 not published, 403 removed by a
 * moderator, 403 published by another member.
 */
async function ownPage(req: Request, ctx: ExtContext, rootUid: string) {
  const pub = await db.query.publication.findFirst({
    where: and(eq(publication.graphId, ctx.graphId), eq(publication.rootUid, rootUid)),
  });
  if (!pub) return json(req, { error: "Not published" }, 404);
  // A removed page stays put, so deleting and republishing can't get around the takedown.
  if (pub.removedAt) return removedResponse(req, pub.removedReason);
  if (ctx.role !== "owner" && pub.publishedBy !== ctx.userId) return notYoursResponse(req);
  return pub;
}

export async function DELETE(
  req: Request,
  { params }: RouteContext<"/api/ext/publications/[rootUid]">,
) {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  const pub = await ownPage(req, ctx, (await params).rootUid);
  if (pub instanceof Response) return pub;
  await db.delete(publication).where(eq(publication.id, pub.id));
  return json(req, { deleted: true });
}

const PatchBody = z.object({ visibility: z.enum(["public", "unlisted"]) });

/** Lists or unlists the page in its graph. Access, collections and Discover are set on the website. */
export async function PATCH(
  req: Request,
  { params }: RouteContext<"/api/ext/publications/[rootUid]">,
) {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(req, { error: "Invalid visibility" }, 400);
  const pub = await ownPage(req, ctx, (await params).rootUid);
  if (pub instanceof Response) return pub;
  await db.update(publication).set({ visibility: parsed.data.visibility }).where(eq(publication.id, pub.id));
  const url = (await primaryUrls(ctx.graphName, [pub])).get(pub.id);
  return json(req, { visibility: parsed.data.visibility, url });
}
