import { and, asc, count, desc, eq, type SQL, sql } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { AccessLock, lockInfo } from "@/components/access-lock";
import { DashboardLink } from "@/components/dashboard-link";
import { ManageLink } from "@/components/manage-link";
import { FeedLink } from "@/components/feed-link";
import { GateNotice } from "@/components/gate-notice";
import { RemovedNotice } from "@/components/removed-notice";
import { ReportAbuseButton } from "@/components/report-abuse-button";
import { QuickSearch } from "@/components/quick-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { SiteFooter } from "@/components/site-footer";
import { formatDate, ListStatus, ListToolbar, PageList } from "@/components/page-list";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { db } from "@/db";
import { publication } from "@/db/schema";
import { graphFeedPath, hasGraphFeed } from "@/lib/feeds";
import { containerLock, gate, showsAuthor } from "@/lib/gates";
import { canSearchSite, graphRole } from "@/lib/graph-access";
import { graphPath, loadGraph } from "@/lib/graphs";
import { GRAPH_LIST, type GraphSort, LIST_PAGE_SIZE, parseListState } from "@/lib/list-params";
import { type BodyVisible, listWhere, relevance, snippet, snippetParts, tagCounts } from "@/lib/list-query";
import { livePublication } from "@/lib/moderation";
import { openInContainer } from "@/lib/places";
import { publicationPath } from "@/lib/publications";
import { publicProfile } from "@/lib/profiles";
import { bylineFor, viewerId } from "@/lib/viewer";

const order = (sort: GraphSort | "relevance", q: string, bodyVisible: BodyVisible): SQL[] =>
  ({
    updated: [desc(publication.updatedAt)],
    created: [desc(publication.createdAt)],
    title: [asc(sql`lower(${publication.title})`), asc(publication.title)],
    relevance: [desc(relevance(q, bodyVisible)), desc(publication.updatedAt)],
  })[sort];

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
  const state = parseListState(GRAPH_LIST, await props.searchParams);
  const path = graphPath(g.name);

  // Listed pages, protected ones included: they show with a lock and ask for the password.
  const visible = and(
    eq(publication.graphId, g.id),
    eq(publication.inGraph, true),
    eq(publication.visibility, "public"),
    livePublication,
  );
  // Members read every page; everyone else only searches the text of pages open to them.
  const bodyVisible = role ? undefined : openInContainer(publication.access, g.defaultAccess);
  const matchingWhere = listWhere(state, bodyVisible, visible);
  const [[{ total }], [{ matching }], rows, tags, owner] = await Promise.all([
    db.select({ total: count() }).from(publication).where(visible),
    db.select({ matching: count() }).from(publication).where(matchingWhere),
    db
      .select({
        rootUid: publication.rootUid,
        kind: publication.kind,
        title: publication.title,
        tags: publication.tags,
        snippet: state.q ? snippet(state.q, bodyVisible) : sql<string | null>`null`,
        createdAt: publication.createdAt,
        updatedAt: publication.updatedAt,
        access: publication.access,
        encrypted: publication.encrypted,
        showAuthor: publication.showAuthor,
        authorName: publication.authorName,
        publishedBy: publication.publishedBy,
      })
      .from(publication)
      .where(matchingWhere)
      .orderBy(...order(state.sort, state.q, bodyVisible), asc(publication.id))
      .limit(LIST_PAGE_SIZE)
      .offset((state.page - 1) * LIST_PAGE_SIZE),
    tagCounts(sql`from ${publication}`, and(matchingWhere, bodyVisible)),
    g.showOwner ? publicProfile(g.userId) : null,
  ]);

  return (
    <>
      <main className="relative flex-1 bg-card">
        <div className="absolute top-3 right-4 left-4 flex items-center justify-end gap-1">
          <QuickSearch scope={{ path: graphPath(g.name), name: g.name }} siteSearch={await canSearchSite(me)} />
          <DashboardLink href={role ? `/dashboard/${encodeURIComponent(g.name)}` : undefined} />
          {role === "owner" && <ManageLink href={`/dashboard/${encodeURIComponent(g.name)}/settings`} />}
          {hasGraphFeed(g) && <FeedLink href={graphFeedPath(g.name)} />}
          <ReportAbuseButton target={{ graphName: g.name }} />
          <ThemeToggle size="icon-sm" className="text-muted-foreground" />
        </div>
        <div className="mx-auto w-full max-w-[700px] px-4 py-16">
          {owner && (
            <Breadcrumbs items={[{ label: `@${owner.username}`, href: `/u/${owner.username}` }, { label: g.name }]} />
          )}
          <h1 className="mb-1 text-[32px] sm:text-[42px] leading-tight font-semibold break-words">
            {g.name} <AccessLock access={g.indexAccess} what="graph" name={g.name} />
          </h1>
          {g.description && <p className="mt-1 mb-2 text-foreground/80 break-words">{g.description}</p>}
          <p className="mb-6 text-sm text-muted-foreground">
            {total} published {total === 1 ? "page" : "pages"}
            {total > 0 && (
              <>
                {" · "}
                <Link href={`${path}/tags`} className="text-link hover:underline">
                  Browse tags
                </Link>
              </>
            )}
          </p>
          {total === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No public pages yet</EmptyTitle>
                <EmptyDescription>Check back later.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <ListToolbar cfg={GRAPH_LIST} path={path} state={state} tags={tags} placeholder="Search this graph" tagIndex={`${path}/tags`} />
              <ListStatus cfg={GRAPH_LIST} path={path} state={state} matching={matching} total={total} />
              <PageList
                cfg={GRAPH_LIST}
                path={path}
                state={state}
                matching={matching}
                dateLabels={["Updated", "Created"]}
                rows={await Promise.all(
                  rows.map(async (r) => ({
                    href: publicationPath(g.name, r.rootUid, r.title),
                    kind: r.kind,
                    title: r.title,
                    // A protected page's tags come from its text, so only readers who can open it see them.
                    tags: role || (r.access === "inherit" ? g.defaultAccess : r.access) === "open" ? r.tags : [],
                    snippet: snippetParts(r.snippet),
                    lock: lockInfo(r.access === "inherit" ? g.defaultAccess : r.access, "graph", g.name, r.encrypted),
                    author: (await bylineFor(r, showsAuthor({ ...g, kind: "graph" }, r)))?.label,
                    dates: [formatDate(r.updatedAt), formatDate(r.createdAt)],
                  })),
                )}
              />
            </>
          )}
        </div>
      </main>
      <SiteFooter className="bg-card" />
    </>
  );
}
