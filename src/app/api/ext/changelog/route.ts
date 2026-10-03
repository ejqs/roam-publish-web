import { changeLogStatusOf } from "@/lib/changelog";
import { json, preflight } from "@/lib/cors";
import { requireExtKey } from "@/lib/ext-auth";
import { withRoute } from "@/lib/telemetry";

export const OPTIONS = preflight;

/**
 * Whether roam.pub can write this graph's change log: "ok" with the last time Roam accepted the
 * stored token, "paused" when the owner turned it off, "invalid" once Roam rejected the token, or
 * "none" when no token is stored. Writes nothing.
 */
export const GET = withRoute("GET /api/ext/changelog", async (req: Request) => {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  return json(req, { changeLog: await changeLogStatusOf(ctx.graphId), graphName: ctx.graphName });
});
