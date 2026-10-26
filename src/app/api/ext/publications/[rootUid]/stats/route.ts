import { json, preflight } from "@/lib/cors";
import { ownPage, requireExtKey } from "@/lib/ext-auth";
import { extStats, STATS_PERIODS, type StatsPeriod } from "@/lib/ext-stats";
import { withRoute } from "@/lib/telemetry";

export const OPTIONS = preflight;

/** The extension's stats for one page: views, upvotes and readers' countries (?period=7, 30 or all). */
export const GET = withRoute("GET /api/ext/publications/[rootUid]/stats", async (
  req: Request,
  { params }: RouteContext<"/api/ext/publications/[rootUid]/stats">,
) => {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  const asked = new URL(req.url).searchParams.get("period") ?? "7";
  if (!STATS_PERIODS.includes(asked as StatsPeriod)) return json(req, { error: "Invalid period" }, 400);
  const pub = await ownPage(req, ctx, (await params).rootUid);
  if (pub instanceof Response) return pub;
  const s = await extStats(ctx, asked as StatsPeriod, new Date(), pub.id);
  return json(req, {
    period: s.period,
    from: s.from,
    dailySince: s.dailySince,
    views: s.views,
    upvotes: s.upvotes,
    countries: s.countries,
    firstPublishedAt: s.firstPublishedAt,
    publishingDays: s.publishingDays,
  });
});
