import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { graph } from "@/db/schema";
import { requireSession } from "@/lib/session";
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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Dashboard
        </Link>
        <h1 className="text-2xl font-semibold">{g.name}</h1>
        <p className="text-sm text-muted-foreground">Graph settings</p>
      </div>
      <GraphSettingsForm
        graphId={g.id}
        graphName={g.name}
        initial={{
          frontPage: g.frontPage,
          indexable: g.indexable,
          featured: g.featured,
          showOwner: g.showOwner,
          hideUnlistedBreadcrumbs: g.hideUnlistedBreadcrumbs,
          description: g.description,
        }}
      />
    </div>
  );
}
