import { z } from "zod";
import { changeLogStatusOf, recordAnchorCheck } from "@/lib/changelog";
import { json, preflight } from "@/lib/cors";
import { requireExtKey } from "@/lib/ext-auth";
import { rateLimit } from "@/lib/rate-limit";
import { withRoute } from "@/lib/telemetry";

export const OPTIONS = preflight;

const Anchor = z.object({ rootUid: z.string().min(1).max(64), anchorUid: z.string().min(1).max(64) });
const Body = z.object({ present: z.array(Anchor).max(2000), missing: z.array(Anchor).max(2000) });

/**
 * The extension's report of which Changelog blocks it can see in the graph (it checks every few
 * minutes while Roam is open). The change log is only written to recently confirmed blocks.
 */
export const POST = withRoute("POST /api/ext/changelog/confirm", async (req: Request) => {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  if (!rateLimit(`changelog-confirm:${ctx.userId}:${ctx.graphId}`, 60, 15 * 60 * 1000))
    return json(req, { error: "Too many requests" }, 429);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(req, { error: "Invalid body" }, 400);
  await recordAnchorCheck(ctx.graphId, parsed.data.present, parsed.data.missing);
  return json(req, { changeLog: await changeLogStatusOf(ctx.graphId) });
});
