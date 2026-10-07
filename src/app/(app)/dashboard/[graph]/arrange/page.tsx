import { and, asc, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { graph, publication } from "@/db/schema";
import { loadFolders } from "@/lib/front-page";
import { livePublication } from "@/lib/moderation";
import { requireSession } from "@/lib/session";
import { ArrangeForm } from "../../arrange-form";
import { arrangeKey } from "../../arrange-key";
import { graphPagesPath } from "../../filters";
import { ResourceHeader, resourceTabs } from "../../section-tabs";

export const metadata: Metadata = { title: "Arrange graph · Roam Publish" };

export default async function GraphArrangePage(props: PageProps<"/dashboard/[graph]/arrange">) {
  const { graph: graphName } = await props.params;
  const session = await requireSession(`/dashboard/${graphName}/arrange`);
  const g = await db.query.graph.findFirst({
    where: and(eq(graph.name, decodeURIComponent(graphName)), eq(graph.userId, session.user.id)),
  });
  if (!g) notFound();
  const [folders, items] = await Promise.all([
    loadFolders({ graphId: g.id }),
    // What the front page lists.
    db
      .select({ id: publication.id, title: publication.title, kind: publication.kind, folderId: publication.folderId })
      .from(publication)
      .where(and(eq(publication.graphId, g.id), eq(publication.inGraph, true), eq(publication.visibility, "public"), livePublication))
      .orderBy(desc(publication.updatedAt), asc(publication.id)),
  ]);
  const path = graphPagesPath(g.name);
  const saved = { layout: g.frontLayout, folders: folders.map(({ id, name, parentId }) => ({ id, name, parentId })), items };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-6 sm:pt-12">
      <ResourceHeader
        name={g.name}
        caption="Arrange the front page"
        view={g.frontPage ? { href: `/${encodeURIComponent(g.name)}`, label: "View front page" } : undefined}
        tabs={resourceTabs(path, true, true)}
        current={`${path}/arrange`}
      />
      <div className="w-full max-w-3xl">
        <ArrangeForm key={arrangeKey(saved)} target={{ kind: "graph", id: g.id }} {...saved} />
      </div>
    </div>
  );
}
