import { graphFeed, hasGraphFeed, rssResponse } from "@/lib/feeds";
import { loadGraph } from "@/lib/graphs";
import { withRoute } from "@/lib/telemetry";

export const GET = withRoute("GET /[graph]/feed.xml", async (_req: Request, ctx: RouteContext<"/[graph]/feed.xml">) => {
  const { graph: graphName } = await ctx.params;
  const g = await loadGraph(decodeURIComponent(graphName));
  if (!g || !hasGraphFeed(g)) return new Response("Not found", { status: 404 });
  return rssResponse(await graphFeed(g));
});
