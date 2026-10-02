import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { AccessLock, lockExplanation } from "@/components/access-lock";
import { DashboardLink } from "@/components/dashboard-link";
import { FeedLink } from "@/components/feed-link";
import { GateNotice } from "@/components/gate-notice";
import { RemovedNotice } from "@/components/removed-notice";
import { ReportAbuseButton } from "@/components/report-abuse-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { SiteFooter } from "@/components/site-footer";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { db } from "@/db";
import { publication } from "@/db/schema";
import { graphFeedPath, hasGraphFeed } from "@/lib/feeds";
import { containerLock, gate, showsAuthor } from "@/lib/gates";
import { graphRole } from "@/lib/graph-access";
import { graphPath, loadGraph } from "@/lib/graphs";
import { livePublication } from "@/lib/moderation";
import { publicProfile } from "@/lib/profiles";
import { bylineFor, viewerId } from "@/lib/viewer";
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
    description: g.description || undefined,
    alternates: {
      canonical: graphPath(g.name),
      types: hasGraphFeed(g) ? { "application/rss+xml": graphFeedPath(g.name) } : undefined,
    },
    robots: g.indexable && g.indexAccess === "open" ? undefined : { index: false, follow: false },
  };
}

export default async function GraphFrontPage(props: PageProps<"/[graph]">) {
  const g = await frontPageGraph(props);
  if (!g) notFound();
  if (g.takenDown) return <RemovedNotice what="graph" />;
  const me = await viewerId();
  const role = me ? await graphRole(me, g.id) : null;
  const blocker = await gate(g.indexAccess, containerLock({ ...g, kind: "graph" }), {
    member: !!role,
    manager: false,
    signedIn: !!me,
  });
  if (blocker) return <GateNotice blocker={blocker} what="graph" next={graphPath(g.name)} />;
  const search = await props.searchParams;
  const sort = parseSort(search.sort);
  const page = parsePage(search.page);

  // Listed pages, protected ones included: they show with a lock and ask for the password.
  const visible = and(
    eq(publication.graphId, g.id),
    eq(publication.inGraph, true),
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
        access: publication.access,
        showAuthor: publication.showAuthor,
        authorName: publication.authorName,
        publishedBy: publication.publishedBy,
      })
      .from(publication)
      .where(visible)
      .orderBy(...ORDER[sort])
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    g.showOwner ? publicProfile(g.userId) : null,
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <main className="relative flex-1 bg-card">
        <div className="absolute top-3 right-4 flex items-center gap-1">
          <DashboardLink href={role ? `/dashboard/${encodeURIComponent(g.name)}` : undefined} />
          {hasGraphFeed(g) && <FeedLink href={graphFeedPath(g.name)} />}
          <ReportAbuseButton target={{ graphName: g.name }} />
          <ThemeToggle size="icon-sm" className="text-muted-foreground" />
        </div>
        <div className="mx-auto w-full max-w-[700px] px-4 py-16">
          {owner && (
            <Breadcrumbs items={[{ label: `@${owner.username}`, href: `/u/${owner.username}` }, { label: g.name }]} />
          )}
          <h1 className="mb-1 text-[42px] leading-tight font-semibold break-words">
            {g.name} <AccessLock access={g.indexAccess} what="graph" name={g.name} />
          </h1>
          {g.description && <p className="mt-1 mb-2 text-foreground/80 break-words">{g.description}</p>}
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
              rows={await Promise.all(
                rows.map(async (r) => ({
                  rootUid: r.rootUid,
                  kind: r.kind,
                  title: r.title,
                  lock: lockExplanation(r.access === "inherit" ? g.defaultAccess : r.access, "graph", g.name),
                  author: (await bylineFor(r, showsAuthor({ ...g, kind: "graph" }, r)))?.label,
                  createdAt: r.createdAt.toISOString(),
                  updatedAt: r.updatedAt.toISOString(),
                })),
              )}
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
