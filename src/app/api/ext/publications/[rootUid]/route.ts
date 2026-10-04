import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { ENTRY_LISTING, graph, publication } from "@/db/schema";
import { logChange } from "@/lib/changelog";
import { dropOrphanLockKeys } from "@/lib/encryption";
import { json, preflight } from "@/lib/cors";
import { extListing, LISTING_LOG, listingChanges, listingSet, pageDiscoverBlocked } from "@/lib/listing";
import { type ExtContext, notYoursResponse, removedResponse, requireExtKey } from "@/lib/ext-auth";
import { primaryUrls } from "@/lib/places";
import { withRoute } from "@/lib/telemetry";

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

export const DELETE = withRoute("DELETE /api/ext/publications/[rootUid]", async (
  req: Request,
  { params }: RouteContext<"/api/ext/publications/[rootUid]">,
) => {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  const pub = await ownPage(req, ctx, (await params).rootUid);
  if (pub instanceof Response) return pub;
  await db.delete(publication).where(eq(publication.id, pub.id));
  await dropOrphanLockKeys(db);
  logChange(pub, "publishing", "Unpublished");
  return json(req, { deleted: true });
});

const PatchBody = z.union([
  z.object({ listing: z.enum(ENTRY_LISTING) }),
  // Older extensions: unlisted or public, leaving the Discover flag as it was.
  z.object({ visibility: z.enum(["public", "unlisted"]) }),
]);

/**
 * Sets where the page is listed: unlisted, on its graph's front page, or also on Discover. Access
 * and collections are set on the website.
 */
export const PATCH = withRoute("PATCH /api/ext/publications/[rootUid]", async (
  req: Request,
  { params }: RouteContext<"/api/ext/publications/[rootUid]">,
) => {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(req, { error: "Invalid listing" }, 400);
  const pub = await ownPage(req, ctx, (await params).rootUid);
  if (pub instanceof Response) return pub;
  const g = (await db.query.graph.findFirst({ where: eq(graph.id, ctx.graphId) }))!;
  let set: Partial<typeof publication.$inferInsert>;
  let changed: string | undefined;
  if ("listing" in parsed.data) {
    const { listing } = parsed.data;
    const blocked = listing === "discover" && pageDiscoverBlocked(g, pub);
    if (blocked) return json(req, { error: blocked }, 400);
    set = listingSet(listing);
    if (listingChanges(pub, listing)) changed = LISTING_LOG[listing];
  } else {
    const { visibility } = parsed.data;
    set = { visibility };
    if (visibility !== pub.visibility) changed = `Made ${visibility}`;
  }
  const [after] = await db.update(publication).set(set).where(eq(publication.id, pub.id)).returning();
  if (changed) logChange(pub, "listing", changed);
  const url = (await primaryUrls(ctx.graphName, [after])).get(after.id);
  return json(req, { visibility: after.visibility, ...extListing(g, after), url });
});
