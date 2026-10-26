import { json, preflight } from "@/lib/cors";
import { requireExtKey } from "@/lib/ext-auth";
import { extStats, STATS_PERIODS, type StatsPeriod } from "@/lib/ext-stats";
import { withRoute } from "@/lib/telemetry";

export const OPTIONS = preflight;

/** The extension's dashboard: views, upvotes, pages and collections for this key's holder (?period=7, 30 or all). */
export const GET = withRoute("GET /api/ext/stats", async (req: Request) => {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  const asked = new URL(req.url).searchParams.get("period") ?? "30";
  if (!STATS_PERIODS.includes(asked as StatsPeriod)) return json(req, { error: "Invalid period" }, 400);
  return json(req, await extStats(ctx, asked as StatsPeriod));
});
