import { z } from "zod";
import { json, preflight } from "@/lib/cors";
import { ownPage, requireExtKey } from "@/lib/ext-auth";
import { pinOf } from "@/lib/pins";
import { PIN_MAX_PLACES } from "@/lib/pin-rules";
import { mayChangePin, removePin, savePin } from "@/lib/pin-writes";
import { withRoute } from "@/lib/telemetry";

export const OPTIONS = preflight;

/** Where the owner shared the link, one URL each (pin-rules.ts `parseSharedAt` checks them). */
const Body = z.object({ sharedAt: z.array(z.string().max(2000)).min(1).max(PIN_MAX_PLACES * 4) });

const NOT_ALLOWED = "Only the person who published this page or the graph owner can pin its link, and only while it's in its graph.";

/**
 * The page's link in its graph, pinned from the extension (from 0.5.0) as on the website: POST pins
 * it or changes where it's shared, DELETE unpins it. Answers with the pin as it now is.
 */
export const POST = withRoute("POST /api/ext/publications/[rootUid]/pin", async (
  req: Request,
  { params }: RouteContext<"/api/ext/publications/[rootUid]/pin">,
) => {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  const pub = await ownPage(req, ctx, (await params).rootUid);
  if (pub instanceof Response) return pub;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(req, { error: "Paste at least one place you've shared it." }, 400);
  const target = { kind: "page" as const, publicationId: pub.id };
  if (!(await mayChangePin(ctx.userId, target))) return json(req, { error: NOT_ALLOWED }, 403);
  const res = await savePin(ctx.userId, target, parsed.data.sharedAt.join("\n"));
  if (!res.ok) return json(req, { error: res.message }, 400);
  return json(req, { message: res.message, pin: await pinOf(target) });
});

export const DELETE = withRoute("DELETE /api/ext/publications/[rootUid]/pin", async (
  req: Request,
  { params }: RouteContext<"/api/ext/publications/[rootUid]/pin">,
) => {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  const pub = await ownPage(req, ctx, (await params).rootUid);
  if (pub instanceof Response) return pub;
  const target = { kind: "page" as const, publicationId: pub.id };
  if (!(await mayChangePin(ctx.userId, target))) return json(req, { error: NOT_ALLOWED }, 403);
  const res = await removePin(target);
  return json(req, { message: res.message, pin: null });
});
