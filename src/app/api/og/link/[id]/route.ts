import { eq } from "drizzle-orm";
import { db } from "@/db";
import { publication } from "@/db/schema";
import { type Container, effectiveAccess, type Place, showsAuthor } from "@/lib/gates";
import { loadGraphById } from "@/lib/graphs";
import { cardFor } from "@/lib/og/card";
import { CARD_CACHE, renderCard } from "@/lib/og/render";
import { withRoute } from "@/lib/telemetry";

/** The link-preview image for an Unlisted page in its graph, by its /l/ id; it doesn't name the graph. */
export const GET = withRoute("GET /api/og/link/[id]", async (_req: Request, ctx: RouteContext<"/api/og/link/[id]">) => {
  const { id } = await ctx.params;
  const pub = await db.query.publication.findFirst({ where: eq(publication.linkId, decodeURIComponent(id).toLowerCase()) });
  if (!pub || !pub.inGraph || pub.removedAt || pub.visibility !== "unlisted") return new Response(null, { status: 404 });
  const g = await loadGraphById(pub.graphId);
  if (!g || g.takenDown) return new Response(null, { status: 404 });
  const container: Container = { ...g, kind: "graph" };
  const place: Place = { ...pub, kind: "publication" };
  const card = await cardFor(pub, { container: null, access: effectiveAccess(container, place), showAuthor: showsAuthor(container, place) });
  return renderCard(card, CARD_CACHE);
});
