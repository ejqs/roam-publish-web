import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { type Access, collection, collectionEntry, graph, publication } from "@/db/schema";
import { logChange, logForPublications, roamInert } from "@/lib/changelog";
import { addEntry, collectionsOf } from "@/lib/collections";
import { json, preflight } from "@/lib/cors";
import { canEncryptWith, encryptNewPageIfWanted, KeysError, syncPublicationKeys } from "@/lib/encryption";
import { ENCRYPT_PASSWORD_MIN } from "@/lib/encryption-rules";
import { ownPage, requireExtKey } from "@/lib/ext-auth";
import { primaryUrls } from "@/lib/places";
import { collectionUrl, entryUrl } from "@/lib/publications";
import { pinBlocked, placeLink } from "@/lib/pin-rules";
import { pinOf } from "@/lib/pins";
import { withRoute } from "@/lib/telemetry";

export const OPTIONS = preflight;

type Pub = typeof publication.$inferSelect;
type Coll = typeof collection.$inferSelect;

/** Who can read the page at its graph place right now. */
const graphAccess = (pub: Pub, g: { defaultAccess: Access }): Access =>
  pub.access === "inherit" ? g.defaultAccess : pub.access;

/** How a page starts out in this collection: the same rules as `addEntry`. An encrypted page always uses Password. */
function startsAs(c: Coll, pub: Pub) {
  if (pub.encrypted) return { listing: "listed" as const, access: "password" as const };
  return {
    listing: c.featured && c.indexAccess === "open" && c.defaultAccess === "open" ? ("discover" as const) : ("listed" as const),
    access: c.defaultAccess,
  };
}

/**
 * Why an encrypted page can't go in this collection: it'd have no password to use there, or one
 * that can't encrypt (set before encryption existed, or too short).
 */
async function encryptedBlocked(pub: Pub, c: Coll) {
  if (!pub.encrypted) return undefined;
  if (!c.passwordHash) return `This page is encrypted. Give ${c.name} a password first.`;
  if (!(await canEncryptWith({ scope: "collection", id: c.id }, "")))
    return `This page is encrypted, and ${c.name}'s password can't encrypt yet. Set one of at least ${ENCRYPT_PASSWORD_MIN} characters in its settings, or enter it there again.`;
}

/**
 * Whether adding the page here takes it out of its graph: when the collection asks for that
 * ("Take added pages out of their graph"), or keeps readers out (password or members only) while
 * the graph place would let them read it anyway, so the graph link would get around its lock.
 */
const movesOutOfGraph = (pub: Pub, g: { defaultAccess: Access }, c: Coll) =>
  pub.inGraph &&
  (c.pagesLeaveGraph || (!pub.encrypted && c.defaultAccess !== "open" && c.defaultAccess !== graphAccess(pub, g)));

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
    collections: await Promise.all(collections.map(async (c) => {
      const e = entries.get(c.id);
      return {
        id: c.id,
        name: c.name,
        url: collectionUrl(c.slug),
        ...startsAs(c, pub),
        /** The page's link in this collection, when it's already there. */
        entryUrl: e ? entryUrl(c.slug, e.entryUid, pub.title) : null,
        /** Why it can't be added here, when it can't. */
        blocked: e ? null : ((await encryptedBlocked(pub, c)) ?? null),
        movesOutOfGraph: !e && movesOutOfGraph(pub, g, c),
      };
    })),
  });
});

const PostBody = z.object({ collectionId: z.string().min(1).max(64) });

/**
 * Adds the page to a collection the key's holder belongs to, with the collection's defaults. Takes
 * it out of its graph when the collection is stricter (see `movesOutOfGraph`). An encrypted page
 * goes in with Password and Needs republish: the extension republishes it next, which seals its
 * content to every place's password without needing one.
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
  const blocked = await encryptedBlocked(pub, c);
  if (blocked) return json(req, { error: blocked }, 409);
  const g = (await db.query.graph.findFirst({ where: eq(graph.id, ctx.graphId) }))!;
  const moves = movesOutOfGraph(pub, g, c);
  // Leaving the graph would take its pinned graph link down.
  const pinned = moves && pinBlocked(placeLink(g.name), await pinOf({ kind: "page", publicationId: pub.id }));
  if (pinned) return json(req, { error: `Adding it to ${c.name} would take it out of ${g.name}. ${pinned.replace(/Unpin it first\.$/, "Unpin it on roam.pub first.")}` }, 409);
  const entry = await addEntry(c.id, pub.id, ctx.userId);
  if (!entry) return json(req, { error: `It's already in ${c.name}.` }, 409);
  let needsRepublish = false;
  if (pub.encrypted) {
    try {
      await db.transaction(async (tx) => {
        await tx.update(collectionEntry).set({ access: "password", listing: "listed" }).where(eq(collectionEntry.id, entry.id));
        needsRepublish = await syncPublicationKeys(tx, pub.id, { orRepublish: true });
      });
    } catch (e) {
      await db.delete(collectionEntry).where(eq(collectionEntry.id, entry.id));
      if (e instanceof KeysError) return json(req, { error: e.message }, 409);
      throw e;
    }
  }
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
    listing: pub.encrypted ? "listed" : entry.listing,
    access: pub.encrypted ? "password" : entry.access,
    movedOutOfGraph: moves,
    encrypted: encrypted || pub.encrypted,
    /** Encrypted, and it opens there once republished: the extension republishes it right away. */
    needsRepublish,
    /** The page's main link, which changes to this one when it left its graph. */
    url: (await primaryUrls(ctx.graphName, [after])).get(pub.id),
  });
});
