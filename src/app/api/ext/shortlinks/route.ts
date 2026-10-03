import { z } from "zod";
import { json, preflight } from "@/lib/cors";
import { requireExtKey } from "@/lib/ext-auth";
import { ensureShortlink, shortUrl } from "@/lib/shortlinks";
import { withRoute } from "@/lib/telemetry";

export const OPTIONS = preflight;

const Body = z.object({ rootUid: z.string().min(1).max(64) });

/**
 * The permanent /p/{id} link for a page or block, created if needed. The extension calls this
 * before the first publish so it can write the shortlink block, then sends that block's uid along.
 */
export const POST = withRoute("POST /api/ext/shortlinks", async (req: Request) => {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(req, { error: "Invalid body" }, 400);
  const link = await ensureShortlink(ctx.graphId, parsed.data.rootUid);
  return json(req, { shortUrl: shortUrl(link.id), anchorUid: link.anchorUid });
});
