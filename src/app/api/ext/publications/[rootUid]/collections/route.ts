import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { type Access, collection, collectionEntry, graph, publication } from "@/db/schema";
import { logChange, logForPublications, roamInert } from "@/lib/changelog";
import { addEntry, collectionsOf } from "@/lib/collections";
import { json, preflight } from "@/lib/cors";
import { encryptNewPageIfWanted } from "@/lib/encryption";
import { ownPage, requireExtKey } from "@/lib/ext-auth";
import { primaryUrls } from "@/lib/places";
import { collectionUrl, entryUrl } from "@/lib/publications";
import { withRoute } from "@/lib/telemetry";

export const OPTIONS = preflight;

type Pub = typeof publication.$inferSelect;
type Coll = typeof collection.$inferSelect;

/** Who can read the page at its graph place right now. */
const graphAccess = (pub: Pub, g: { defaultAccess: Access }): Access =>
  pub.access === "inherit" ? g.defaultAccess : pub.access;

/** How a page starts out in this collection: the same rules as `addEntry`. */
function startsAs(c: Coll) {
  return {
    listing: c.featured && c.indexAccess === "open" && c.defaultAccess === "open" ? ("discover" as const) : ("listed" as const),
    access: c.defaultAccess,
  };
}

/**
 * Whether adding the page here takes it out of its graph: when the collection keeps readers out
 * (password or members only) and the graph place would let them read it anyway, the graph link
 * would get around the collection's lock.
 */
const movesOutOfGraph = (pub: Pub, g: { defaultAccess: Access }, c: Coll) =>
  pub.inGraph && c.defaultAccess !== "open" && c.defaultAccess !== graphAccess(pub, g);

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
  const g = (await db.query.graph.findFirst({ where: eq(graph.id, ctx.graphId) }))!;
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
        movesOutOfGraph: !e && movesOutOfGraph(pub, g, c),
      };
    }),
  });
});

const PostBody = z.object({ collectionId: z.string().min(1).max(64) });

/**
 * Adds the page to a collection the key's holder belongs to, with the collection's defaults. Takes
 * it out of its graph when the collection is stricter (see `movesOutOfGraph`). Encrypted pages are
 * added on the website, which can ask for their password.
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
  const g = (await db.query.graph.findFirst({ where: eq(graph.id, ctx.graphId) }))!;
  const moves = movesOutOfGraph(pub, g, c);
  const entry = await addEntry(c.id, pub.id, ctx.userId);
  if (!entry) return json(req, { error: `It's already in ${c.name}.` }, 409);
  if (moves) await db.update(publication).set({ inGraph: false }).where(eq(publication.id, pub.id));
  // Now that every place it's shown may be locked, the collection may want it encrypted.
  const encrypted = await encryptNewPageIfWanted(pub.id).catch((e) => {
    console.error("Couldn't encrypt a page added to a collection", pub.id, e);
    return false;
  });
  const url = entryUrl(c.slug, entry.entryUid, pub.title);
  await logForPublications([pub.id], "collections", `Added to collection ${collectionLink(c)}: ${url}`);
  if (moves) logChange(pub, "listing", "Hidden from the graph (collections only)");
  if (encrypted) logChange(pub, "access", "Encrypted with password", `encrypted:${pub.id}:${entry.id}`);
  const after = { ...pub, inGraph: pub.inGraph && !moves };
  return json(req, {
    name: c.name,
    entryUrl: url,
    listing: entry.listing,
    access: entry.access,
    movedOutOfGraph: moves,
    encrypted,
    /** The page's main link, which changes to this one when it left its graph. */
    url: (await primaryUrls(ctx.graphName, [after])).get(pub.id),
  });
});
