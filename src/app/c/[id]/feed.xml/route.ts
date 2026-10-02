import { collectionFeed, hasCollectionFeed, rssResponse } from "@/lib/feeds";
import { loadCollection } from "@/lib/collections";

export async function GET(_req: Request, ctx: RouteContext<"/c/[id]/feed.xml">) {
  const { id } = await ctx.params;
  const c = await loadCollection(decodeURIComponent(id));
  if (!c || !hasCollectionFeed(c)) return new Response("Not found", { status: 404 });
  return rssResponse(await collectionFeed(c));
}
