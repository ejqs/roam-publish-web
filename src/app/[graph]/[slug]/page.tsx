import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { BlockList } from "@/components/roam/block-tree";
import type { PageLinks } from "@/components/roam/markup";
import { SiteFooter } from "@/components/site-footer";
import { db } from "@/db";
import { graph, publication } from "@/db/schema";
import { plainText } from "@/lib/slug";

const load = cache(async (graphName: string, slug: string) => {
  const g = await db.query.graph.findFirst({ where: eq(graph.name, graphName) });
  if (!g) return null;
  const pub = await db.query.publication.findFirst({
    where: and(eq(publication.graphId, g.id), eq(publication.slug, slug)),
  });
  if (!pub) return null;
  return { g, pub };
});

export async function generateMetadata(props: PageProps<"/[graph]/[slug]">): Promise<Metadata> {
  const { graph: graphName, slug } = await props.params;
  const data = await load(decodeURIComponent(graphName), slug);
  if (!data) return { title: "Not found" };
  return { title: `${plainText(data.pub.title)} · ${data.g.name}` };
}

export default async function PublishedPage(props: PageProps<"/[graph]/[slug]">) {
  const { graph: graphName, slug } = await props.params;
  const data = await load(decodeURIComponent(graphName), slug);
  if (!data) notFound();
  const { g, pub } = data;

  const pages = await db
    .select({ title: publication.title, slug: publication.slug })
    .from(publication)
    .where(and(eq(publication.graphId, g.id), eq(publication.kind, "page")));
  const links: PageLinks = new Map(
    pages.map((p) => [p.title.toLowerCase(), `/${encodeURIComponent(g.name)}/${p.slug}`]),
  );

  const tree = pub.tree;
  return (
    <>
      <main className="flex-1 bg-card">
        <article className="mx-auto w-full max-w-[700px] px-4 py-16 text-[16px]">
          <p className="mb-2 text-sm text-muted-foreground">{g.name}</p>
          {pub.kind === "page" ? (
            <>
              <h1 className="mb-6 text-[42px] leading-tight font-semibold break-words">{pub.title}</h1>
              <BlockList nodes={tree.children} links={links} />
            </>
          ) : (
            <BlockList nodes={[tree]} links={links} />
          )}
          <p className="mt-12 text-xs text-muted-foreground">
            Last updated {pub.updatedAt.toLocaleDateString("en-US", { dateStyle: "medium" })}
          </p>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}

