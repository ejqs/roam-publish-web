import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { graph, type Node, publication } from "@/db/schema";
import { contentHash } from "@/lib/content-hash";
import { json, preflight } from "@/lib/cors";
import { addEntry } from "@/lib/collections";
import { notYoursResponse, removedResponse, requireExtKey } from "@/lib/ext-auth";
import { defaultCollectionsFor, primaryUrls } from "@/lib/places";
import { plainText } from "@/lib/slug";

const NodeSchema: z.ZodType<Node> = z.lazy(() =>
  z.object({
    uid: z.string().min(1).max(64),
    string: z.string().max(100_000),
    heading: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    viewType: z.enum(["bullet", "numbered", "document"]).optional(),
    align: z.enum(["left", "center", "right", "justify"]).optional(),
    embed: NodeSchema.optional(),
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
});

const MAX_BYTES = 1_000_000;

export const OPTIONS = preflight;

export async function GET(req: Request) {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  const rows = await db
    .select()
    .from(publication)
    .where(eq(publication.graphId, ctx.graphId))
    .orderBy(desc(publication.updatedAt));
  const urls = await primaryUrls(ctx.graphName, rows);
  return json(req, {
    publications: rows.map((p) => ({
      rootUid: p.rootUid,
      kind: p.kind,
      title: p.title,
      url: urls.get(p.id),
      contentHash: p.contentHash,
      visibility: p.visibility,
      removed: !!p.removedAt,
      mine: ctx.role === "owner" || p.publishedBy === ctx.userId,
      updatedAt: p.updatedAt,
    })),
  });
}

export async function POST(req: Request) {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return json(req, { error: "Content too large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(req, { error: "Invalid JSON" }, 400);
  }
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
  if (existing) {
    // Members change only what they published; the owner changes anything.
    if (ctx.role !== "owner" && existing.publishedBy !== ctx.userId) return notYoursResponse(req);
    const visibility = existing.visibility;
    const url = (await primaryUrls(ctx.graphName, [{ ...existing, title }])).get(existing.id);
    // Older extensions don't send an author; leave the stored one alone then.
    const authorChanged = p.author !== undefined && authorName !== existing.authorName;
    if (existing.contentHash === hash && !authorChanged)
      return json(req, { status: "unchanged", url, contentHash: hash, visibility });
    await db
      .update(publication)
      .set(
        existing.contentHash === hash
          ? { authorName }
          : {
              title,
              tree: p.tree,
              contentHash: hash,
              kind: p.kind,
              updatedAt: new Date(),
              ...(p.author !== undefined && { authorName }),
            },
      )
      .where(eq(publication.id, existing.id));
    return json(req, { status: "updated", url, contentHash: hash, visibility });
  }

  // New pages go where the graph's "New pages go to" setting says. If that leaves them nowhere
  // (no graph place and no collection the publisher belongs to), they stay in the graph.
  const g = await db.query.graph.findFirst({ where: eq(graph.id, ctx.graphId) });
  const collections = await defaultCollectionsFor(ctx.graphId, ctx.userId);
  const inGraph = !!g?.newPagesInGraph || collections.length === 0;

  const [created] = await db
    .insert(publication)
    .values({
      graphId: ctx.graphId,
      rootUid: p.rootUid,
      kind: p.kind,
      title,
      tree: p.tree,
      contentHash: hash,
      publishedBy: ctx.userId,
      authorName,
      inGraph,
      // New pages start from the graph's Discover default; later changes to it don't apply.
      // A graph whose pages default to a password or members never starts them on Discover.
      discoverable: sql`(select ${graph.featured} and ${graph.defaultAccess} = 'open' from ${graph} where ${graph.id} = ${ctx.graphId})`,
    })
    .returning();
  for (const collectionId of collections) await addEntry(collectionId, created.id, ctx.userId);
  const url = (await primaryUrls(ctx.graphName, [created])).get(created.id);
  return json(req, { status: "created", url, contentHash: hash, visibility: created.visibility });
}
