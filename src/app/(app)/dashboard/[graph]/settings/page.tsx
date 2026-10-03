import { and, count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { graph, publication } from "@/db/schema";
import { graphUnderModeration } from "@/lib/deletion";
import { requireSession } from "@/lib/session";
import { ChangeLogForm } from "./change-log-form";
import { DeleteGraphCard } from "./delete-graph";
import { GraphSettingsForm } from "./settings-form";
import { graphPagesPath } from "../../filters";
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
  const [[pages], locked] = await Promise.all([
    db.select({ n: count() }).from(publication).where(eq(publication.graphId, g.id)),
    graphUnderModeration(db, g),
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
        <GraphSettingsForm
          graphId={g.id}
          graphName={g.name}
          indexOpen={g.indexAccess === "open"}
          defaultsHref={`${graphPagesPath(g.name)}/defaults`}
          initial={{
            frontPage: g.frontPage,
            indexable: g.indexable,
            featured: g.featured,
            showOwner: g.showOwner,
            hideUnlistedBreadcrumbs: g.hideUnlistedBreadcrumbs,
            rss: g.rss,
            description: g.description,
          }}
        />
        <ChangeLogForm
          graphId={g.id}
          status={g.appendTokenStatus === "invalid" ? "invalid" : g.appendTokenEnc ? "ok" : null}
          paused={g.changeLogPaused}
          addedAt={g.appendTokenAddedAt?.toISOString() ?? null}
        />
        <DeleteGraphCard graphId={g.id} graphName={g.name} pageCount={pages?.n ?? 0} locked={locked} />
      </div>
    </div>
  );
}
