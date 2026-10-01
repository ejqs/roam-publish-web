import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { type Node, publication } from "@/db/schema";
import { contentHash } from "@/lib/content-hash";
import { json, preflight } from "@/lib/cors";
import { removedResponse, requireExtKey } from "@/lib/ext-auth";
import { publicationUrl } from "@/lib/publications";
import { plainText } from "@/lib/slug";

const NodeSchema: z.ZodType<Node> = z.lazy(() =>
  z.object({
    uid: z.string().min(1).max(64),
    string: z.string().max(100_000),
    heading: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    viewType: z.enum(["bullet", "numbered", "document"]).optional(),
    align: z.enum(["left", "center", "right", "justify"]).optional(),
    embed: NodeSchema.optional(),
    children: z.array(NodeSchema),
  }),
);

const Body = z.object({
  rootUid: z.string().min(1).max(64),
  kind: z.enum(["page", "block"]),
  title: z.string().max(1000),
  tree: NodeSchema,
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
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
  return json(req, {
    publications: rows.map((p) => ({
      rootUid: p.rootUid,
      kind: p.kind,
      title: p.title,
      url: publicationUrl(ctx.graphName, p.rootUid, p.title),
      contentHash: p.contentHash,
      visibility: p.visibility,
      removed: !!p.removedAt,
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

  const existing = await db.query.publication.findFirst({
    where: and(eq(publication.graphId, ctx.graphId), eq(publication.rootUid, p.rootUid)),
  });

  if (existing?.removedAt) return removedResponse(req, existing.removedReason);
  if (existing) {
    const url = publicationUrl(ctx.graphName, p.rootUid, title);
    const visibility = existing.visibility;
    if (existing.contentHash === hash)
      return json(req, { status: "unchanged", url, contentHash: hash, visibility });
    await db
      .update(publication)
      .set({ title, tree: p.tree, contentHash: hash, kind: p.kind, updatedAt: new Date() })
      .where(eq(publication.id, existing.id));
    return json(req, { status: "updated", url, contentHash: hash, visibility });
  }

  const [created] = await db.insert(publication).values({
    graphId: ctx.graphId,
    rootUid: p.rootUid,
    kind: p.kind,
    title,
    tree: p.tree,
    contentHash: hash,
  }).returning({ visibility: publication.visibility });
  return json(req, {
    status: "created",
    url: publicationUrl(ctx.graphName, p.rootUid, title),
    contentHash: hash,
    visibility: created.visibility,
  });
}
