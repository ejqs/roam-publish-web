import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { publication } from "@/db/schema";
import { type Container, effectiveAccess, type Place, showsAuthor } from "@/lib/gates";
import { loadGraph } from "@/lib/graphs";
import { cardFor } from "@/lib/og/card";
import { CARD_CACHE, renderCard } from "@/lib/og/render";
import { withRoute } from "@/lib/telemetry";

/** The link-preview image for a page in its graph (lib/link-preview.ts). */
export const GET = withRoute(
  "GET /api/og/page/[graph]/[uid]",
  async (_req: Request, ctx: RouteContext<"/api/og/page/[graph]/[uid]">) => {
    const { graph: graphName, uid } = await ctx.params;
    const g = await loadGraph(decodeURIComponent(graphName));
    if (!g || g.takenDown) return new Response(null, { status: 404 });
    const pub = await db.query.publication.findFirst({
      where: and(eq(publication.graphId, g.id), eq(publication.rootUid, decodeURIComponent(uid))),
    });
    if (!pub || !pub.inGraph || pub.removedAt) return new Response(null, { status: 404 });
    const container: Container = { ...g, kind: "graph" };
    const place: Place = { ...pub, kind: "publication" };
    const card = await cardFor(pub, {
      container: g.name,
      access: effectiveAccess(container, place),
      showAuthor: showsAuthor(container, place),
    });
    return renderCard(card, CARD_CACHE);
  },
);
