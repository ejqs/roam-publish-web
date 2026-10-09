import { pdfStyleOf } from "@/lib/pdf";
import { and, count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { graph, graphDefaultCollection, publication } from "@/db/schema";
import { collectionsOf } from "@/lib/collections";
import { graphUnderModeration } from "@/lib/deletion";
import { requireSession } from "@/lib/session";
import { ChangeLogForm } from "./change-log-form";
import { DeleteGraphCard } from "./delete-graph";
import { GraphDisplayForm } from "./display-form";
import { GraphSettingsForm } from "./settings-form";
import { graphPagesPath } from "@/lib/dashboard-filters";
import { ResourceHeader, resourceTabs } from "../../section-tabs";

export const metadata: Metadata = { title: "Graph settings · Roam Publish" };

export default async function GraphSettingsPage(props: PageProps<"/dashboard/[graph]/settings">) {
  const { graph: graphName } = await props.params;
  const name = decodeURIComponent(graphName);
  const session = await requireSession(`/dashboard/${graphName}/settings`);
  const g = await db.query.graph.findFirst({
    where: and(eq(graph.name, name), eq(graph.userId, session.user.id)),
  });
  if (!g) notFound();
  const [[pages], locked, collections, defaults] = await Promise.all([
    db.select({ n: count() }).from(publication).where(eq(publication.graphId, g.id)),
    graphUnderModeration(db, g),
    collectionsOf(session.user.id),
    db.select().from(graphDefaultCollection).where(eq(graphDefaultCollection.graphId, g.id)),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:py-12">
      <ResourceHeader
        name={g.name}
        caption="Graph settings"
        tabs={resourceTabs(graphPagesPath(g.name), true, true)}
        current={`${graphPagesPath(g.name)}/settings`}
      />
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <GraphSettingsForm graphId={g.id} initial={{ description: g.description }} />
        <GraphDisplayForm
          graphId={g.id}
          graphName={g.name}
          frontPage={g.frontPage}
          indexOpen={g.indexAccess === "open"}
          initial={{
            showAuthors: g.showAuthors,
            views: g.views,
            showViewCountries: g.showViewCountries,
            pdfDownload: g.pdfDownload,
            pdfStyle: pdfStyleOf(g.pdfStyle),
            showOwner: g.showOwner,
            hideUnlistedBreadcrumbs: g.hideUnlistedBreadcrumbs,
            rss: g.rss,
            newPagesInGraph: g.newPagesInGraph,
            defaultCollections: defaults.map((d) => d.collectionId),
          }}
          collections={collections.filter((c) => !c.suspendedAt).map((c) => ({ id: c.id, name: c.name }))}
        />
        <ChangeLogForm
          graphId={g.id}
          status={g.appendTokenStatus === "invalid" ? "invalid" : g.appendTokenEnc ? "ok" : null}
          paused={g.changeLogPaused}
          options={{ off: g.changeLogOff, merge: g.changeLogMerge, byDay: g.changeLogByDay }}
          addedAt={g.appendTokenAddedAt?.toISOString() ?? null}
        />
        <DeleteGraphCard graphId={g.id} graphName={g.name} pageCount={pages?.n ?? 0} locked={locked} />
      </div>
    </div>
  );
}
