import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { collection, collectionEntry } from "@/db/schema";
import { logForPublications, roamInert } from "@/lib/changelog";
import { addEntry, collectionsOf } from "@/lib/collections";
import { json, preflight } from "@/lib/cors";
import { ownPage, requireExtKey } from "@/lib/ext-auth";
import { primaryUrls } from "@/lib/places";
import { collectionUrl, entryUrl } from "@/lib/publications";
import { withRoute } from "@/lib/telemetry";

export const OPTIONS = preflight;

type Coll = typeof collection.$inferSelect;

/** How a page starts out in this collection: the same rules as `addEntry`. */
function startsAs(c: Coll) {
  return {
    listing: c.featured && c.indexAccess === "open" && c.defaultAccess === "open" ? ("discover" as const) : ("listed" as const),
    access: c.defaultAccess,
  };
}

const collectionLink = (c: { name: string; slug: string }) => `[${roamInert(c.name) || c.slug}](${collectionUrl(c.slug)})`;

/**
 * Collections this key's holder can add the page to, with how it would start out in each and
 * whether it's already there.
 */
export const GET = withRoute("GET /api/ext/publications/[rootUid]/collections", async (
  req: Request,
  { params }: RouteContext<"/api/ext/publications/[rootUid]/collections">,
) => {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  const pub = await ownPage(req, ctx, (await params).rootUid);
  if (pub instanceof Response) return pub;
  const entries = new Map(
    (await db.select().from(collectionEntry).where(eq(collectionEntry.publicationId, pub.id))).map((e) => [e.collectionId, e]),
  );
  const collections = (await collectionsOf(ctx.userId)).filter((c) => !c.suspendedAt);
  return json(req, {
    collections: collections.map((c) => {
      const e = entries.get(c.id);
      return {
        id: c.id,
        name: c.name,
        url: collectionUrl(c.slug),
        ...startsAs(c),
        /** The page's link in this collection, when it's already there. */
        entryUrl: e ? entryUrl(c.slug, e.entryUid, pub.title) : null,
      };
    }),
  });
});

const PostBody = z.object({ collectionId: z.string().min(1).max(64) });

/**
 * Adds the page to a collection the key's holder belongs to, with the collection's defaults, as the
 * website's `addToCollection` does: its graph place, access and content stay as they are. Leaving
 * the graph or encrypting the page is the owner's choice, made in the page's settings. Encrypted
 * pages are added on the website, which can ask for their password.
 */
export const POST = withRoute("POST /api/ext/publications/[rootUid]/collections", async (
  req: Request,
  { params }: RouteContext<"/api/ext/publications/[rootUid]/collections">,
) => {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  const parsed = PostBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(req, { error: "Invalid collection" }, 400);
  const pub = await ownPage(req, ctx, (await params).rootUid);
  if (pub instanceof Response) return pub;
  const c = (await collectionsOf(ctx.userId)).find((x) => x.id === parsed.data.collectionId);
  if (!c) return json(req, { error: "Join that collection on roam.pub first." }, 403);
  if (c.suspendedAt) return json(req, { error: "That collection isn't available." }, 403);
  if (pub.encrypted)
    return json(req, { error: "This page is encrypted, so add it to a collection on roam.pub, where you can enter its password." }, 409);
  const entry = await addEntry(c.id, pub.id, ctx.userId);
  if (!entry) return json(req, { error: `It's already in ${c.name}.` }, 409);
  const url = entryUrl(c.slug, entry.entryUid, pub.title);
  await logForPublications([pub.id], "collections", `Added to collection ${collectionLink(c)}: ${url}`);
  return json(req, {
    name: c.name,
    entryUrl: url,
    listing: entry.listing,
    access: entry.access,
    /** The page's main link, which adding it to a collection doesn't change. */
    url: (await primaryUrls(ctx.graphName, [pub])).get(pub.id),
  });
});
