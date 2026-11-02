import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { GraphPage, graphPageMetadata, graphPlace } from "@/app/[graph]/[uid]/[[...slug]]/graph-page";
import { db } from "@/db";
import { publication } from "@/db/schema";
import { loadGraphById } from "@/lib/graphs";
import { placePath, zoomParam } from "@/lib/publications";

/** An Unlisted page in its graph, by the random id of its address, which doesn't name the graph. */
const load = cache(async (linkId: string) => {
  const pub = await db.query.publication.findFirst({ where: eq(publication.linkId, linkId.toLowerCase()) });
  return pub ? graphPlace(await loadGraphById(pub.graphId), pub) : null;
});

export async function generateMetadata(props: PageProps<"/l/[id]/[[...slug]]">): Promise<Metadata> {
  const { id } = await props.params;
  const data = await load(decodeURIComponent(id));
  // A Public page's metadata belongs to its graph address, where this one redirects.
  return graphPageMetadata(data && data.pub.visibility === "unlisted" ? data : null);
}

export default async function UnlistedPage(props: PageProps<"/l/[id]/[[...slug]]">) {
  const { id, slug } = await props.params;
  const data = await load(decodeURIComponent(id));
  if (!data) notFound();
  // Made Public since the link was shared: the page now lives at its graph address.
  if (data.pub.visibility === "public") redirect(placePath(data.g.name, data.pub));
  return GraphPage({ data, slug, zoom: zoomParam(await props.searchParams) });
}
