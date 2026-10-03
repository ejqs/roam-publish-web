import { resolveC } from "@/lib/collections";
import { type Container, effectiveAccess, type Place, showsAuthor } from "@/lib/gates";
import { cardFor } from "@/lib/og/card";
import { CARD_CACHE, renderCard } from "@/lib/og/render";
import { withRoute } from "@/lib/telemetry";

/** The link-preview image for a page in a collection (lib/link-preview.ts). */
export const GET = withRoute("GET /api/og/entry/[entry]", async (_req: Request, ctx: RouteContext<"/api/og/entry/[entry]">) => {
  const { entry: entryUid } = await ctx.params;
  const r = await resolveC(decodeURIComponent(entryUid));
  if (r?.kind !== "entry" || r.c.takenDown || r.graphTakenDown || r.pub.removedAt) return new Response(null, { status: 404 });
  const container: Container = { ...r.c, kind: "collection" };
  const place: Place = { ...r.entry, kind: "entry" };
  const card = await cardFor(r.pub, {
    container: r.c.name,
    access: effectiveAccess(container, place),
    showAuthor: showsAuthor(container, place),
  });
  return renderCard(card, CARD_CACHE);
});
