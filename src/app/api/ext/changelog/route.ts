import { changeLogStatusOf } from "@/lib/changelog";
import { json, preflight } from "@/lib/cors";
import { requireExtKey } from "@/lib/ext-auth";

export const OPTIONS = preflight;

/**
 * Whether roam.pub can write this graph's change log: "ok" with the last time Roam accepted the
 * stored token, "invalid" once Roam rejected it, or "none" when no token is stored. Writes nothing.
 */
export async function GET(req: Request) {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  return json(req, { changeLog: await changeLogStatusOf(ctx.graphId), graphName: ctx.graphName });
}
