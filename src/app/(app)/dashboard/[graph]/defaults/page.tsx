import { and, count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { graph, graphDefaultCollection, publication } from "@/db/schema";
import { collectionsOf } from "@/lib/collections";
import { requireSession } from "@/lib/session";
import { sealedPageTitles } from "@/lib/encryption";
import { GraphAccessForm } from "./access-form";
import { graphPagesPath } from "../../filters";
import { ResourceHeader, resourceTabs } from "../../section-tabs";

export const metadata: Metadata = { title: "Graph defaults · Roam Publish" };

export default async function GraphDefaultsPage(props: PageProps<"/dashboard/[graph]/defaults">) {
  const { graph: graphName } = await props.params;
  const name = decodeURIComponent(graphName);
  const session = await requireSession(`/dashboard/${graphName}/defaults`);
  const g = await db.query.graph.findFirst({
    where: and(eq(graph.name, name), eq(graph.userId, session.user.id)),
  });
  if (!g) notFound();
  const [collections, defaults, [pages]] = await Promise.all([
    collectionsOf(session.user.id),
    db.select().from(graphDefaultCollection).where(eq(graphDefaultCollection.graphId, g.id)),
    db.select({ n: count() }).from(publication).where(eq(publication.graphId, g.id)),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 sm:py-12">
      <ResourceHeader
        name={g.name}
        caption="Defaults for pages in this graph. Each page can override them."
        tabs={resourceTabs(graphPagesPath(g.name), true, true)}
        current={`${graphPagesPath(g.name)}/defaults`}
      />
      <GraphAccessForm
        graphId={g.id}
        graphName={g.name}
        pageCount={pages?.n ?? 0}
        initial={{
          indexAccess: g.indexAccess,
          defaultAccess: g.defaultAccess,
          hasPassword: !!g.passwordHash,
          showAuthors: g.showAuthors,
          views: g.views,
          showViewCountries: g.showViewCountries,
          newPagesInGraph: g.newPagesInGraph,
          defaultCollections: defaults.map((d) => d.collectionId),
        }}
        collections={collections.filter((c) => !c.suspendedAt).map((c) => ({ id: c.id, name: c.name }))}
        encryptedPages={await sealedPageTitles({ scope: "graph", id: g.id })}
      />
    </div>
  );
}
