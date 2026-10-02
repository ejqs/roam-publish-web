import { and, count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { graph, graphDefaultCollection, publication } from "@/db/schema";
import { collectionsOf } from "@/lib/collections";
import { graphUnderModeration } from "@/lib/deletion";
import { requireSession } from "@/lib/session";
import { GraphAccessForm } from "./access-form";
import { ChangeLogForm } from "./change-log-form";
import { DeleteGraphCard } from "./delete-graph";
import { GraphSettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Graph settings · Roam Publish" };

export default async function GraphSettingsPage(props: PageProps<"/dashboard/[graph]/settings">) {
  const { graph: graphName } = await props.params;
  const name = decodeURIComponent(graphName);
  const session = await requireSession(`/dashboard/${graphName}/settings`);
  const g = await db.query.graph.findFirst({
    where: and(eq(graph.name, name), eq(graph.userId, session.user.id)),
  });
  if (!g) notFound();
  const [collections, defaults, [pages], locked] = await Promise.all([
    collectionsOf(session.user.id),
    db.select().from(graphDefaultCollection).where(eq(graphDefaultCollection.graphId, g.id)),
    db.select({ n: count() }).from(publication).where(eq(publication.graphId, g.id)),
    graphUnderModeration(db, g),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-semibold">{g.name}</h1>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Graph settings</p>
          <Link
            href={`/dashboard/${encodeURIComponent(g.name)}/members`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Members
          </Link>
        </div>
      </div>
      <GraphSettingsForm
        graphId={g.id}
        graphName={g.name}
        indexOpen={g.indexAccess === "open"}
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
      <GraphAccessForm
        graphId={g.id}
        graphName={g.name}
        pageCount={pages?.n ?? 0}
        initial={{
          indexAccess: g.indexAccess,
          defaultAccess: g.defaultAccess,
          hasPassword: !!g.passwordHash,
          showAuthors: g.showAuthors,
          newPagesInGraph: g.newPagesInGraph,
          defaultCollections: defaults.map((d) => d.collectionId),
        }}
        collections={collections.filter((c) => !c.suspendedAt).map((c) => ({ id: c.id, name: c.name }))}
      />
      <ChangeLogForm
        graphId={g.id}
        status={g.appendTokenStatus === "invalid" ? "invalid" : g.appendTokenEnc ? "ok" : null}
        addedAt={g.appendTokenAddedAt?.toISOString() ?? null}
      />
      <DeleteGraphCard graphId={g.id} graphName={g.name} pageCount={pages?.n ?? 0} locked={locked} />
    </div>
  );
}
