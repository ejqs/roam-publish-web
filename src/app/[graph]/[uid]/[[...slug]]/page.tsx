import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { publication } from "@/db/schema";
import { loadGraph } from "@/lib/graphs";
import { placePath, zoomParam } from "@/lib/publications";
import { GraphPage, graphPageMetadata, graphPlace } from "./graph-page";

// Only graph + uid identify a publication; the optional trailing slug is decorative.
const load = cache(async (graphName: string, rootUid: string) => {
  const g = await loadGraph(graphName);
  const pub = g
    ? await db.query.publication.findFirst({ where: and(eq(publication.graphId, g.id), eq(publication.rootUid, rootUid)) })
    : null;
  return graphPlace(g, pub);
});

export async function generateMetadata(props: PageProps<"/[graph]/[uid]/[[...slug]]">): Promise<Metadata> {
  const { graph: graphName, uid } = await props.params;
  return graphPageMetadata(await load(decodeURIComponent(graphName), decodeURIComponent(uid)));
}

export default async function PublishedPage(props: PageProps<"/[graph]/[uid]/[[...slug]]">) {
  const { graph: graphName, uid, slug } = await props.params;
  const data = await load(decodeURIComponent(graphName), decodeURIComponent(uid));
  if (!data) notFound();
  // Unlisted pages live at /l/{linkId}, which doesn't name the graph. Links to this address shared
  // before keep working by leading there.
  if (data.pub.visibility === "unlisted" && !data.g.takenDown && !data.pub.removedAt) redirect(placePath(data.g.name, data.pub));
  return GraphPage({ data, slug, zoom: zoomParam(await props.searchParams) });
}
