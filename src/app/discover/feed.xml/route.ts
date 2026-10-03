import { discoverFeed, rssResponse } from "@/lib/feeds";
import { withRoute } from "@/lib/telemetry";

export const GET = withRoute("GET /discover/feed.xml", async () => {
  return rssResponse(await discoverFeed());
});
