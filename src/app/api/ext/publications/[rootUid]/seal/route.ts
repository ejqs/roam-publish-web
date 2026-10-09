import { json, preflight } from "@/lib/cors";
import { sealPlan } from "@/lib/e2e-publish";
import { requireExtKey } from "@/lib/ext-auth";
import { withRoute } from "@/lib/telemetry";

export const OPTIONS = preflight;

/**
 * Whether the page is encrypted (a new one: whether it will be), and the public keys of the passwords
 * to seal its content key to, so the extension can encrypt it in Roam before publishing
 * (lib/e2e-publish.ts). Asked before every publish; `?encrypt=1` for "Publish with encryption".
 */
export const GET = withRoute("GET /api/ext/publications/[rootUid]/seal", async (
  req: Request,
  { params }: RouteContext<"/api/ext/publications/[rootUid]/seal">,
) => {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  const encrypt = new URL(req.url).searchParams.get("encrypt") === "1";
  return json(req, await sealPlan(ctx.graphId, ctx.userId, (await params).rootUid, undefined, { encrypt }));
});
