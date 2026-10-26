import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { collectionEntry, ENTRY_LISTING, PLACE_PDF, PLACE_VIEWS, SHOW_AUTHOR } from "@/db/schema";
import { json, preflight } from "@/lib/cors";
import { ownPage, requireExtKey } from "@/lib/ext-auth";
import { removeEntryAs, updateEntryAs } from "@/lib/place-edits";
import { primaryUrls } from "@/lib/places";
import { withRoute } from "@/lib/telemetry";

export const OPTIONS = preflight;

type Ctx = RouteContext<"/api/ext/publications/[rootUid]/collections/[collectionId]">;

/** The page's entry in that collection, after the same checks as the page itself (`ownPage`). */
async function entryOf(req: Request, { params }: Ctx) {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  const { rootUid, collectionId } = await params;
  const pub = await ownPage(req, ctx, rootUid);
  if (pub instanceof Response) return pub;
  const entry = await db.query.collectionEntry.findFirst({
    where: and(eq(collectionEntry.publicationId, pub.id), eq(collectionEntry.collectionId, collectionId)),
  });
  if (!entry) return json(req, { error: "It isn't in that collection." }, 404);
  return { ctx, pub, entry };
}

const PatchBody = z
  .object({
    listing: z.enum(ENTRY_LISTING).optional(),
    showAuthor: z.enum(SHOW_AUTHOR).optional(),
    views: z.enum(PLACE_VIEWS).optional(),
    pdfDownload: z.enum(PLACE_PDF).optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined));

/**
 * The page's own settings in one collection: where it's listed there, its byline, view count and
 * Download PDF ("inherit" follows the collection). The website's rules apply (lib/place-edits.ts):
 * only the collection's owner, or the member who added it, can change an entry.
 */
export const PATCH = withRoute("PATCH /api/ext/publications/[rootUid]/collections/[collectionId]", async (req: Request, rc: Ctx) => {
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(req, { error: "Invalid settings" }, 400);
  const found = await entryOf(req, rc);
  if (found instanceof Response) return found;
  const saved = await updateEntryAs(found.ctx.userId, found.entry.id, parsed.data);
  if (!saved.ok) return json(req, { error: saved.message }, 409);
  const after = (await db.query.collectionEntry.findFirst({ where: eq(collectionEntry.id, found.entry.id) }))!;
  return json(req, { listing: after.listing, showAuthor: after.showAuthor, views: after.views, pdfDownload: after.pdfDownload });
});

/**
 * Takes the page out of the collection. When it was its last place, it goes back to its graph,
 * unlisted, as on the website.
 */
export const DELETE = withRoute("DELETE /api/ext/publications/[rootUid]/collections/[collectionId]", async (req: Request, rc: Ctx) => {
  const found = await entryOf(req, rc);
  if (found instanceof Response) return found;
  const removed = await removeEntryAs(found.ctx.userId, found.entry.id);
  if (!removed.ok) return json(req, { error: removed.message }, 409);
  const pub = (await db.query.publication.findFirst({ where: (p, { eq }) => eq(p.id, found.pub.id) }))!;
  return json(req, {
    removed: true,
    inGraph: pub.inGraph,
    /** The page's main link, which moves back to its graph when that was its last collection. */
    url: (await primaryUrls(found.ctx.graphName, [pub])).get(pub.id),
  });
});
