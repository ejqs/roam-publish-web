import { json, preflight } from "@/lib/cors";
import { placesFor } from "@/lib/e2e-publish";
import { requireExtKey } from "@/lib/ext-auth";
import { withRoute } from "@/lib/telemetry";

export const OPTIONS = preflight;

/**
 * Where a new page can be published (extension 0.2.0 and later): the graph and the key holder's
 * collections, how a page starts out in each, and where "New pages go to" puts it. The extension asks
 * "Publish where?" with these, then sends its pick as `to` with the seal plan and the publish.
 */
export const GET = withRoute("GET /api/ext/places", async (req: Request) => {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  return json(req, await placesFor(ctx.graphId, ctx.userId));
});
