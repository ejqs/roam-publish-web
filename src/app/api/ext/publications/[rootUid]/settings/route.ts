import { eq } from "drizzle-orm";
import { db } from "@/db";
import { graph } from "@/db/schema";
import { json, preflight } from "@/lib/cors";
import { entryDiscoverBlocked, graphListingBlocked } from "@/lib/control-rules";
import { ownPage, requireExtKey } from "@/lib/ext-auth";
import { listingOf, pageDiscoverBlocked } from "@/lib/listing";
import { type ContainerDefaults, manageDataFor } from "@/lib/manage-data";
import { publicationUrl } from "@/lib/publications";
import { withRoute } from "@/lib/telemetry";

export const OPTIONS = preflight;

const appUrl = (path: string) => new URL(path, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").toString();

/** What "As the graph" or "As the collection" means for each setting there. */
const defaults = (c: ContainerDefaults) => ({
  showAuthor: c.showAuthors ? ("show" as const) : ("hide" as const),
  views: c.views,
  pdfDownload: c.pdfDownload ? ("on" as const) : ("off" as const),
});

/**
 * The extension's Page settings dialog: the page's own settings in its graph and in each collection,
 * what "As the graph" or "As the collection" stands for, and why a choice is unavailable, from the
 * same rules the website uses. Access and passwords are shown, not changed, here.
 */
export const GET = withRoute("GET /api/ext/publications/[rootUid]/settings", async (
  req: Request,
  { params }: RouteContext<"/api/ext/publications/[rootUid]/settings">,
) => {
  const ctx = await requireExtKey(req);
  if (ctx instanceof Response) return ctx;
  const pub = await ownPage(req, ctx, (await params).rootUid);
  if (pub instanceof Response) return pub;
  const m = (await manageDataFor(ctx.userId, [pub.id])).get(pub.id);
  if (!m) return json(req, { error: "Only the person who published this page or the graph owner can change it" }, 403);
  const g = (await db.query.graph.findFirst({ where: eq(graph.id, ctx.graphId) }))!;
  const gp = m.graphPlace;
  const graphAccess = gp.state.access === "inherit" ? gp.container.defaultAccess : gp.state.access;
  return json(req, {
    encrypted: m.encrypted,
    manageUrl: appUrl(`/dashboard/${encodeURIComponent(m.origin.graphName)}`),
    graph: {
      name: gp.container.label,
      inGraph: gp.inGraph,
      url: publicationUrl(m.origin.graphName, m.origin.rootUid, m.title),
      listing: listingOf(gp),
      /** Why its listing can't change here (only in collections), if it can't. */
      listingBlocked: graphListingBlocked(gp.inGraph) ?? null,
      /** Why it can't go On Discover, if it can't. */
      discoverBlocked: pageDiscoverBlocked(g, pub) ?? null,
      access: graphAccess,
      showAuthor: gp.state.showAuthor,
      views: gp.state.views,
      pdfDownload: gp.state.pdfDownload,
      defaults: defaults(gp.container),
    },
    collections: m.entries.map((e) => {
      const access = e.state.access === "inherit" ? e.container.defaultAccess : e.state.access;
      return {
        id: e.collectionId,
        name: e.collectionName,
        url: appUrl(e.path),
        canManage: e.canManage,
        listing: e.state.listing ?? "listed",
        discoverBlocked:
          e.container.discoverBlocked ??
          entryDiscoverBlocked(access, { indexAccess: "open", indexable: true, suspended: false }) ??
          null,
        access,
        showAuthor: e.state.showAuthor,
        views: e.state.views,
        pdfDownload: e.state.pdfDownload,
        defaults: defaults(e.container),
      };
    }),
  });
});
