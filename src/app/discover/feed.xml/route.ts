import { discoverFeed, rssResponse } from "@/lib/feeds";

export async function GET() {
  return rssResponse(await discoverFeed());
}
