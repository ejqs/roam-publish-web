import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { collectionEntry, graph, type Node, publication, shortlink } from "@/db/schema";
import { contentHash } from "@/lib/content-hash";
import { emptyTree, encryptNewPageIfWanted, plainHash, sealHash, sealNewContent } from "@/lib/encryption";
import { keyedHash } from "@/lib/keyed-hash";
import { indexFields } from "@/lib/tags";
import { json, preflight } from "@/lib/cors";
import { changeLogStatusOf, logChange, validTimeZone } from "@/lib/changelog";
import { addEntry } from "@/lib/collections";
import { notYoursResponse, removedResponse, requireExtKey } from "@/lib/ext-auth";
import { extListing } from "@/lib/listing";
import { defaultCollectionsFor, primaryUrls } from "@/lib/places";
import { ensureShortlink, setAnchor, shortlinkSet, shortUrl, withoutShortlinks } from "@/lib/shortlinks";
import { plainText } from "@/lib/slug";
import { withRoute } from "@/lib/telemetry";

const NodeSchema: z.ZodType<Node> = z.lazy(() =>
  z.object({
    uid: z.string().min(1).max(64),
    string: z.string().max(100_000),
    heading: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    viewType: z.enum(["bullet", "numbered", "document"]).optional(),
    align: z.enum(["left", "center", "right", "justify"]).optional(),
    embed: NodeSchema.optional(),
    moreEmbeds: z.array(NodeSchema).max(50).optional(),
    title: z.string().max(1000).optional(),
    children: z.array(NodeSchema),
  }),
);

const Body = z.object({
  rootUid: z.string().min(1).max(64),
  kind: z.enum(["page", "block"]),
  title: z.string().max(1000),
  tree: NodeSchema,
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  /** Byline from the extension's Author name setting; not part of the hash. */
  author: z.string().trim().max(100).optional(),
  /** Uid of the shortlink block the extension wrote in Roam; the change log goes under it. Not hashed. */
  anchorUid: z.string().min(1).max(64).optional(),
  /** The publisher's IANA time zone, for dating change log entries. Not hashed. */
  timeZone: z.string().max(64).optional(),
});

const MAX_BYTES = 1_000_000;
/** Far deeper than any real outline; checked before zod, which recurses once per level. */
const MAX_DEPTH = 200;

/** Whether a parsed tree nests children or embeds deeper than MAX_DEPTH, checked without recursion. */
function tooDeep(body: unknown) {
  const stack: [unknown, number][] = [[(body as { tree?: unknown } | null)?.tree, 1]];
  while (stack.length) {
    const [node, depth] = stack.pop()!;
    if (!node || typeof node !== "object") continue;
    if (depth > MAX_DEPTH) return true;
    const { children, embed, moreEmbeds } = node as { children?: unknown; embed?: unknown; moreEmbeds?: unknown };
    if (Array.isArray(children)) for (const c of children) stack.push([c, depth + 1]);
    if (embed) stack.push([embed, depth + 1]);
    if (Array.isArray(moreEmbeds)) for (const e of moreEmbeds) stack.push([e, depth + 1]);
  }
  return false;
}

export const OPTIONS = preflight;

export const GET = withRoute("GET /api/ext/publications", async (req: Request) => {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  const rows = await db
    .select()
    .from(publication)
    .where(eq(publication.graphId, ctx.graphId))
    .orderBy(desc(publication.updatedAt));
  const g = (await db.query.graph.findFirst({ where: eq(graph.id, ctx.graphId) }))!;
  const urls = await primaryUrls(ctx.graphName, rows);
  const links = new Map(
    (await db.select().from(shortlink).where(eq(shortlink.graphId, ctx.graphId))).map((l) => [l.rootUid, l]),
  );
  // How many collections each page is in; with its graph place, the extension opens the status link
  // instead of one of them when there's more than one.
  const inCollections = new Map(
    rows.length
      ? (
          await db
            .select({ id: collectionEntry.publicationId, n: count() })
            .from(collectionEntry)
            .where(inArray(collectionEntry.publicationId, rows.map((p) => p.id)))
            .groupBy(collectionEntry.publicationId)
        ).map((r) => [r.id, r.n])
      : [],
  );
  return json(req, {
    changeLog: await changeLogStatusOf(ctx.graphId),
    publications: rows.map((p) => ({
      rootUid: p.rootUid,
      kind: p.kind,
      title: p.title,
      url: urls.get(p.id),
      shortUrl: links.has(p.rootUid) ? shortUrl(links.get(p.rootUid)!.id) : null,
      anchorUid: links.get(p.rootUid)?.anchorUid ?? null,
      places: (p.inGraph ? 1 : 0) + (inCollections.get(p.id) ?? 0),
      contentHash: plainHash(p),
      visibility: p.visibility,
      ...extListing(g, p),
      encrypted: p.encrypted,
      removed: !!p.removedAt,
      mine: ctx.role === "owner" || p.publishedBy === ctx.userId,
      updatedAt: p.updatedAt,
    })),
  });
});

export const POST = withRoute("POST /api/ext/publications", async (req: Request) => {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;

  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BYTES) return json(req, { error: "Content too large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(req, { error: "Invalid JSON" }, 400);
  }
  if (tooDeep(body))
    return json(req, { error: `This page is nested more than ${MAX_DEPTH} levels deep, which can't be published.` }, 400);
  const parsed = Body.safeParse(body);
  if (!parsed.success) return json(req, { error: "Invalid publish payload" }, 400);
  const p = parsed.data;

  const hash = contentHash(p);
  if (hash !== p.contentHash) return json(req, { error: "Content hash mismatch" }, 400);

  const title =
    (p.kind === "page" ? p.title : plainText(p.title).slice(0, 80)).trim() || "Untitled";
  const authorName = p.author || null;

  const existing = await db.query.publication.findFirst({
    where: and(eq(publication.graphId, ctx.graphId), eq(publication.rootUid, p.rootUid)),
  });

  if (existing?.removedAt) return removedResponse(req, existing.removedReason);
  // Members change only what they published; the owner changes anything.
  if (existing && ctx.role !== "owner" && existing.publishedBy !== ctx.userId) return notYoursResponse(req);

  const link = await ensureShortlink(ctx.graphId, p.rootUid);
  if (p.anchorUid) await setAnchor(ctx.graphId, p.rootUid, p.anchorUid);
  if (p.timeZone && validTimeZone(p.timeZone))
    await db
      .update(graph)
      .set({ timeZone: p.timeZone })
      // The owner's zone wins; a member's only fills in a missing one.
      .where(and(eq(graph.id, ctx.graphId), ctx.role === "owner" ? undefined : sql`${graph.timeZone} is null`));
  const page = { graphId: ctx.graphId, rootUid: p.rootUid };
  // The hash covers what the extension sent; shortlink blocks in it are never stored or shown.
  const tree = withoutShortlinks(p.tree, await shortlinkSet(ctx.graphId));
  const short = shortUrl(link.id);
  const g = (await db.query.graph.findFirst({ where: eq(graph.id, ctx.graphId) }))!;

  if (existing) {
    const visibility = existing.visibility;
    const listing = extListing(g, existing);
    const url = (await primaryUrls(ctx.graphName, [{ ...existing, title }])).get(existing.id);
    // Older extensions don't send an author; leave the stored one alone then.
    const authorChanged = p.author !== undefined && authorName !== existing.authorName;
    const before = plainHash(existing);
    // A republish that needs its keys again (a password was reset) isn't "unchanged".
    const same = before === hash && !existing.needsRepublish;
    if (same && !authorChanged)
      return json(req, { status: "unchanged", url, shortUrl: short, contentHash: hash, visibility, ...listing, changeLog: await changeLogStatusOf(ctx.graphId) });
    await db.transaction(async (tx) => {
      // An encrypted page stays encrypted: the new content is sealed to its passwords' public keys.
      const content = existing.encrypted
        ? {
            ...(await sealNewContent(tx, existing.id, tree)),
            tree: emptyTree(existing.rootUid),
            searchText: "",
            tags: [],
            contentHash: sealHash(existing.id, hash),
          }
        : { tree, ...indexFields(tree, existing), contentHash: hash };
      await tx
        .update(publication)
        .set(
          same
            ? { authorName }
            : {
                title,
                // Website tag edits survive republishing.
                ...content,
                kind: p.kind,
                updatedAt: new Date(),
                ...(p.author !== undefined && { authorName }),
              },
        )
        .where(eq(publication.id, existing.id));
    });
    // Keyed by the state it changed from, so a retried or concurrent request for the same change is
    // logged once, while every later edit (even back to earlier content) gets its own entry. An
    // encrypted page's hashes stay out of the log's keys.
    const key = (k: string) => (existing.encrypted ? keyedHash("changelog-key", k) : k);
    const from = `${before}@${existing.updatedAt.getTime()}`;
    if (same)
      logChange(page, "publishing", `Byline changed to "${authorName ?? "(none)"}"`, key(`byline:${from}:${existing.authorName ?? ""}>${authorName ?? ""}`));
    else logChange(page, "publishing", "Republished", key(`content:${from}>${hash}`));
    return json(req, { status: "updated", url, shortUrl: short, contentHash: hash, visibility, ...listing, changeLog: await changeLogStatusOf(ctx.graphId) });
  }

  // New pages go where the graph's "New pages go to" setting says. If that leaves them nowhere
  // (no graph place and no collection the publisher belongs to), they stay in the graph.
  const collections = await defaultCollectionsFor(ctx.graphId, ctx.userId);
  const inGraph = g.newPagesInGraph || collections.length === 0;

  const [created] = await db
    .insert(publication)
    .values({
      graphId: ctx.graphId,
      rootUid: p.rootUid,
      kind: p.kind,
      title,
      tree,
      ...indexFields(tree),
      contentHash: hash,
      publishedBy: ctx.userId,
      authorName,
      inGraph,
      // Who can read starts as the graph's current default; changing the default later doesn't move it.
      access: g.defaultAccess,
    })
    .returning();
  for (const collectionId of collections) await addEntry(collectionId, created.id, ctx.userId);
  await encryptNewPageIfWanted(created.id);
  const url = (await primaryUrls(ctx.graphName, [created])).get(created.id);
  logChange(page, "publishing", `Published as ${created.visibility}: ${url}`, `published:${created.id}`);
  return json(req, {
    status: "created",
    url,
    shortUrl: short,
    contentHash: hash,
    visibility: created.visibility,
    ...extListing(g, created),
    changeLog: await changeLogStatusOf(ctx.graphId),
  });
});
