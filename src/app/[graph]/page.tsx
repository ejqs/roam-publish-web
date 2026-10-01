import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { RemovedNotice } from "@/components/removed-notice";
import { ReportAbuseButton } from "@/components/report-abuse-button";
import { SiteFooter } from "@/components/site-footer";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { db } from "@/db";
import { publication } from "@/db/schema";
import { graphPath, loadGraph } from "@/lib/graphs";
import { livePublication } from "@/lib/moderation";
import { publicProfile } from "@/lib/profiles";
import { PublicationTable } from "./publication-table";
import { PAGE_SIZE, parsePage, parseSort } from "./sort";

const ORDER = {
  updated: [desc(publication.updatedAt)],
  created: [desc(publication.createdAt)],
  title: [asc(sql`lower(${publication.title})`), asc(publication.title)],
};

async function frontPageGraph(props: PageProps<"/[graph]">) {
  const { graph: graphName } = await props.params;
  const g = await loadGraph(decodeURIComponent(graphName));
  return g?.frontPage ? g : null;
}

export async function generateMetadata(props: PageProps<"/[graph]">): Promise<Metadata> {
  const g = await frontPageGraph(props);
  if (!g) return { title: "Not found" };
  if (g.takenDown) return { title: "Removed", robots: { index: false, follow: false } };
  return {
    title: g.name,
    alternates: { canonical: graphPath(g.name) },
    robots: g.indexable ? undefined : { index: false, follow: false },
  };
}

export default async function GraphFrontPage(props: PageProps<"/[graph]">) {
  const g = await frontPageGraph(props);
  if (!g) notFound();
  if (g.takenDown) return <RemovedNotice what="graph" />;
  const search = await props.searchParams;
  const sort = parseSort(search.sort);
  const page = parsePage(search.page);

  const visible = and(
    eq(publication.graphId, g.id),
    eq(publication.visibility, "public"),
    livePublication,
  );
  const [[{ total }], rows, owner] = await Promise.all([
    db.select({ total: count() }).from(publication).where(visible),
    db
      .select({
        rootUid: publication.rootUid,
        kind: publication.kind,
        title: publication.title,
        createdAt: publication.createdAt,
        updatedAt: publication.updatedAt,
      })
      .from(publication)
      .where(visible)
      .orderBy(...ORDER[sort])
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    publicProfile(g.userId),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <main className="relative flex-1 bg-card">
        <div className="absolute top-3 right-4">
          <ReportAbuseButton target={{ graphName: g.name }} />
        </div>
        <div className="mx-auto w-full max-w-[700px] px-4 py-16">
          {owner && (
            <Breadcrumbs items={[{ label: `@${owner.username}`, href: `/u/${owner.username}` }, { label: g.name }]} />
          )}
          <h1 className="mb-1 text-[42px] leading-tight font-semibold break-words">{g.name}</h1>
          <p className="mb-8 text-sm text-muted-foreground">
            {total} published {total === 1 ? "page" : "pages"}
          </p>
          {total === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No public pages yet</EmptyTitle>
                <EmptyDescription>Check back later.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <PublicationTable
              graphName={g.name}
              rows={rows.map((r) => ({
                ...r,
                createdAt: r.createdAt.toISOString(),
                updatedAt: r.updatedAt.toISOString(),
              }))}
              sort={sort}
              page={Math.min(page, pageCount)}
              pageCount={pageCount}
            />
          )}
        </div>
      </main>
      <SiteFooter className="bg-card" />
    </>
  );
}
