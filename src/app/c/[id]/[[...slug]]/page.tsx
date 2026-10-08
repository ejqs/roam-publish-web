import { and, asc, count, desc, eq, isNull, ne, type SQL, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessLock, lockInfo } from "@/components/access-lock";
import { DashboardLink } from "@/components/dashboard-link";
import { ManageLink } from "@/components/manage-link";
import { FeedLink } from "@/components/feed-link";
import { GateNotice } from "@/components/gate-notice";
import { dashboardHref, PublicationView } from "@/components/publication-view";
import { RemovedNotice } from "@/components/removed-notice";
import { ReportAbuseButton } from "@/components/report-abuse-button";
import { privacyNotes } from "@/components/privacy-icons";
import { PageLinks } from "@/components/roam/markup";
import { SiteFooter } from "@/components/site-footer";
import { QuickSearch } from "@/components/quick-search";
import { ThemeToggle } from "@/components/theme-toggle";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { db } from "@/db";
import { collectionEntry, graph, publication, publicationVote, user } from "@/db/schema";
import { canManageEntry, collectionRole, resolveC } from "@/lib/collections";
import { readEncrypted } from "@/lib/encryption";
import { collectionFeedPath, hasCollectionFeed } from "@/lib/feeds";
import {
  type Container,
  containerLock,
  effectiveAccess,
  gate,
  pageLock,
  type Place,
  showsAuthor,
  showsViewCountries,
  viewsMode,
} from "@/lib/gates";
import { canManage, canSearchSite, graphRole } from "@/lib/graph-access";
import { cardVersion, previewMetadata } from "@/lib/link-preview";
import { manageDataFor } from "@/lib/manage-data";
import { cardFor, entryCardPath } from "@/lib/og/card";
import { liveGraph } from "@/lib/moderation";
import { collectionPath, entryPath, zoomParam } from "@/lib/publications";
import { collectionTagPath, RELATED_LIMIT } from "@/lib/tag-paths";
import { plainText, slugify } from "@/lib/slug";
import { bylineFor, viewerId } from "@/lib/viewer";
import { loadViewFooter } from "@/lib/views-data";
import { formatDate, ListStatus, ListToolbar, PageList } from "@/components/page-list";
import { COLLECTION_LIST, LIST_PAGE_SIZE, parseListState } from "@/lib/list-params";
import { excerpt, folderStats, listWhere, relevance, snippet, snippetParts, tagCounts } from "@/lib/list-query";
import { browse, cardPlace, chainOf, loadFolders, withStats } from "@/lib/front-page";
import { FrontPage } from "@/components/front-page";
import { cn } from "cn";
import { openInContainer } from "@/lib/places";

type Resolved = NonNullable<Awaited<ReturnType<typeof resolveC>>>;
type C = Resolved["c"];
type Entry = Extract<Resolved, { kind: "entry" }>;
const asContainer = (c: C): Container => ({ ...c, kind: "collection" });

/** What /c/{id}/{...slug} points at: a collection, or a page at /c/{collection}/{entryUid}/{title}. */
async function resolveRoute(rawId: string, slug: string[] = []) {
  const r = await resolveC(decodeURIComponent(rawId));
  if (r?.kind !== "collection") return null;
  if (!slug.length) return { kind: "collection" as const, r };
  const e = await resolveC(decodeURIComponent(slug[0]));
  if (e?.kind !== "entry" || e.c.id !== r.c.id) return null;
  return { kind: "entry" as const, r: e, rest: slug.slice(1) };
}

/** Live pages in a collection, in the owner's order. */
function liveEntries(collectionId: string) {
  return db
    .select({ entry: collectionEntry, pub: publication })
    .from(collectionEntry)
    .innerJoin(publication, eq(publication.id, collectionEntry.publicationId))
    .innerJoin(graph, eq(graph.id, publication.graphId))
    .innerJoin(user, eq(user.id, graph.userId))
    .where(and(eq(collectionEntry.collectionId, collectionId), isNull(publication.removedAt), liveGraph))
    .orderBy(asc(collectionEntry.position), asc(collectionEntry.addedAt));
}

export async function generateMetadata(props: PageProps<"/c/[id]/[[...slug]]">): Promise<Metadata> {
  const { id, slug } = await props.params;
  const route = await resolveRoute(id, slug);
  if (!route) return { title: "Not found" };
  const r = route.r;
  if (r.c.takenDown) return { title: "Removed", robots: { index: false, follow: false } };
  const c = r.c;
  const indexable = c.indexable && c.indexAccess === "open";
  if (r.kind === "collection")
    return {
      title: c.name,
      description: c.description || undefined,
      alternates: {
        canonical: collectionPath(c.slug),
        types: hasCollectionFeed(c) ? { "application/rss+xml": collectionFeedPath(c.slug) } : undefined,
      },
      robots: indexable ? undefined : { index: false, follow: false },
    };
  if (r.pub.removedAt || r.graphTakenDown) return { title: "Removed", robots: { index: false, follow: false } };
  const container = asContainer(c);
  const place: Place = { ...r.entry, kind: "entry" };
  const access = effectiveAccess(container, place);
  const path = entryPath(c.slug, r.entry.entryUid, r.pub.title);
  const card = await cardFor(r.pub, { container: c.name, access, showAuthor: showsAuthor(container, place) });
  const preview = previewMetadata(card, { path, image: entryCardPath(r.entry.entryUid, cardVersion(card)) });
  if (access !== "open") return { ...preview, title: "Protected page", robots: { index: false, follow: false } };
  return {
    ...preview,
    title: `${plainText(r.pub.title)} · ${c.name}`,
    alternates: { canonical: path },
    robots: indexable && r.entry.listing !== "unlisted" ? undefined : { index: false },
  };
}

export default async function CollectionRoute(props: PageProps<"/c/[id]/[[...slug]]">) {
  const { id, slug } = await props.params;
  const route = await resolveRoute(id, slug);
  if (!route) notFound();
  if (route.r.c.takenDown) return <RemovedNotice what="collection" />;
  return route.kind === "collection" ? (
    <CollectionIndex c={route.r.c} search={await props.searchParams} />
  ) : (
    <EntryPage r={route.r} rest={route.rest} zoom={zoomParam(await props.searchParams)} />
  );
}

async function CollectionIndex({ c, search }: { c: C; search: Record<string, string | string[] | undefined> }) {
  const me = await viewerId();
  const role = me ? await collectionRole(me, c.id) : null;
  const container = asContainer(c);
  const blocker = await gate(c.indexAccess, containerLock(container), { member: !!role, manager: false, signedIn: !!me });
  if (blocker) return <GateNotice blocker={blocker} what="collection" next={collectionPath(c.slug)} />;

  const state = parseListState(COLLECTION_LIST, search);
  const path = collectionPath(c.slug);
  const layout = c.frontLayout;
  const from = sql`from ${collectionEntry}
    join ${publication} on ${publication.id} = ${collectionEntry.publicationId}
    join ${graph} on ${graph.id} = ${publication.graphId}
    join ${user} on ${user.id} = ${graph.userId}`;
  const listed = and(
    eq(collectionEntry.collectionId, c.id),
    ne(collectionEntry.listing, "unlisted"),
    isNull(publication.removedAt),
    liveGraph,
  );
  // The table shows every page at once; the other layouts browse folders.
  const folders = layout === "list" ? [] : await loadFolders({ collectionId: c.id });
  const here = browse(folders, state, collectionEntry.folderId);
  // Members read every page; everyone else only searches the text of pages open to them.
  const bodyVisible = role ? undefined : openInContainer(collectionEntry.access, c.defaultAccess);
  const matchingWhere = listWhere(state, bodyVisible, listed, here.where);
  const counted = (where: SQL | undefined) =>
    db
      .select({ n: count() })
      .from(collectionEntry)
      .innerJoin(publication, eq(publication.id, collectionEntry.publicationId))
      .innerJoin(graph, eq(graph.id, publication.graphId))
      .innerJoin(user, eq(user.id, graph.userId))
      .where(where)
      .then(([r]) => r.n);
  const order: Record<typeof state.sort, SQL[]> = {
    order: [asc(collectionEntry.position), asc(collectionEntry.addedAt)],
    added: [desc(collectionEntry.addedAt)],
    updated: [desc(publication.updatedAt)],
    title: [asc(sql`lower(${publication.title})`), asc(publication.title)],
    relevance: [desc(relevance(state.q, bodyVisible)), asc(collectionEntry.position)],
  };
  const [total, matching, rows, tags, stats] = await Promise.all([
    counted(listed),
    counted(matchingWhere),
    db
      .select({
        entry: collectionEntry,
        pub: publication,
        snippet: state.q ? snippet(state.q, bodyVisible) : sql<string | null>`null`,
        excerpt: layout === "list" ? sql<string | null>`null` : excerpt(bodyVisible),
      })
      .from(collectionEntry)
      .innerJoin(publication, eq(publication.id, collectionEntry.publicationId))
      .innerJoin(graph, eq(graph.id, publication.graphId))
      .innerJoin(user, eq(user.id, graph.userId))
      .where(matchingWhere)
      .orderBy(...order[state.sort], asc(collectionEntry.id))
      .limit(LIST_PAGE_SIZE)
      .offset((state.page - 1) * LIST_PAGE_SIZE),
    // Tags across the folder being browsed, so they lead somewhere from here.
    tagCounts(from, and(listWhere(state, bodyVisible, listed, here.subtree), bodyVisible)),
    folders.length
      ? folderStats(from, sql`${collectionEntry.folderId}`, listed, sql`${collectionEntry.position}, ${collectionEntry.addedAt}`)
      : [],
  ]);
  const items = await Promise.all(
    rows.map(async ({ entry, pub, snippet: hit, excerpt: start }) => {
      const open = role || effectiveAccess(container, entry) === "open";
      return {
        href: entryPath(c.slug, entry.entryUid, pub.title),
        lock: lockInfo(effectiveAccess(container, entry), "collection", c.name, pub.encrypted),
        author: (await bylineFor(pub, showsAuthor(container, entry)))?.label,
        kind: pub.kind,
        // A protected page's tags come from its text, so only readers who can open it see them.
        tags: open ? pub.tags : [],
        snippet: snippetParts(hit),
        dates: [formatDate(entry.addedAt), formatDate(pub.updatedAt)],
        ...cardPlace(folders, entry.folderId, here.current?.id, pub.title),
        excerpt: start ?? undefined,
        date: formatDate(pub.updatedAt),
      };
    }),
  );

  const shown = withStats(folders, stats);
  const topFolders = folders.filter((f) => !f.parentId).length;
  const header = (
    <>
      <p className="mb-1 text-sm text-muted-foreground">Collection</p>
      <h1 className="text-[32px] leading-tight font-semibold break-words sm:text-[42px]">
        {c.name} <AccessLock access={c.indexAccess} what="collection" name={c.name} />
      </h1>
      {c.description && <p className="mt-2 max-w-2xl text-[17px] leading-relaxed break-words text-foreground/80">{c.description}</p>}
      <p className="mt-2 text-sm text-muted-foreground">
        {total} {total === 1 ? "page" : "pages"}
        {topFolders > 0 && ` · ${topFolders} ${topFolders === 1 ? "folder" : "folders"}`}
      </p>
    </>
  );

  return (
    <>
      <main className={cn("relative flex-1", layout === "list" ? "bg-card" : "bg-background")}>
        <div className="absolute top-3 right-4 left-4 flex items-center justify-end gap-1">
          <QuickSearch scope={{ path: collectionPath(c.slug), name: c.name }} siteSearch={await canSearchSite(me)} />
          <DashboardLink href={role ? `/dashboard/collections/${encodeURIComponent(c.slug)}` : undefined} />
          {role === "owner" && <ManageLink href={`/dashboard/collections/${encodeURIComponent(c.slug)}/settings`} />}
          {hasCollectionFeed(c) && <FeedLink href={collectionFeedPath(c.slug)} />}
          <ReportAbuseButton target={{ collectionSlug: c.slug }} />
          <ThemeToggle size="icon-sm" className="text-muted-foreground" />
        </div>
        {layout !== "list" ? (
          <FrontPage
            layout={layout}
            cfg={COLLECTION_LIST}
            path={path}
            state={state}
            name={c.name}
            header={header}
            folders={shown}
            chain={chainOf(shown, here.chain)}
            cards={items}
            matching={matching}
            total={total}
            tags={tags}
            placeholder="Search this collection"
          />
        ) : (
        <div className="mx-auto w-full max-w-[700px] px-4 py-16">
          <p className="mb-2 text-sm text-muted-foreground">Collection</p>
          <h1 className="mb-1 text-[32px] sm:text-[42px] leading-tight font-semibold break-words">
            {c.name} <AccessLock access={c.indexAccess} what="collection" name={c.name} />
          </h1>
          {c.description && <p className="mt-1 mb-2 text-foreground/80 break-words">{c.description}</p>}
          <p className="mb-6 text-sm text-muted-foreground">
            {total} {total === 1 ? "page" : "pages"}
          </p>
          {total === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No pages yet</EmptyTitle>
                <EmptyDescription>Check back later.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <ListToolbar cfg={COLLECTION_LIST} path={path} state={state} tags={tags} placeholder="Search this collection" />
              <ListStatus cfg={COLLECTION_LIST} path={path} state={state} matching={matching} total={total} />
              <PageList
                cfg={COLLECTION_LIST}
                path={path}
                state={state}
                rows={items}
                matching={matching}
                dateLabels={["Added", "Updated"]}
              />
            </>
          )}
        </div>
        )}
      </main>
      <SiteFooter className={layout === "list" ? "bg-card" : "bg-background"} />
    </>
  );
}

async function EntryPage({ r, rest, zoom }: { r: Entry; rest: string[]; zoom?: string }) {
  const { c, entry, pub } = r;
  if (r.graphTakenDown) return <RemovedNotice what="graph" />;
  if (pub.removedAt) return <RemovedNotice what="page" />;
  const path = entryPath(c.slug, entry.entryUid, pub.title);
  // Fix up the title slug (and any extra segments) like graph pages do.
  if (rest.length !== 1 || rest[0] !== slugify(pub.title)) redirect(path);

  const container = asContainer(c);
  const place: Place = { ...entry, kind: "entry" };
  const access = effectiveAccess(container, place);
  const me = await viewerId();
  const [cRole, gRole] = me ? await Promise.all([collectionRole(me, c.id), graphRole(me, pub.graphId)]) : [null, null];
  const manager = !!me && (canManageEntry(cRole, me, entry) || canManage(gRole, me, pub));
  const lock = pageLock(container, place);
  // An encrypted page can't be read without its password, whoever the reader is.
  const opened = pub.encrypted ? await readEncrypted(pub, access, lock) : null;
  const blocker = opened ? ("blocker" in opened ? opened.blocker : null) : await gate(access, lock, { member: !!cRole, manager, signedIn: !!me });
  if (blocker) {
    const m = manager && me ? (await manageDataFor(me, [pub.id])).get(pub.id) : undefined;
    return (
      <GateNotice
        blocker={blocker}
        what="page"
        next={path}
        title={entry.listing !== "unlisted" && c.indexAccess === "open" ? plainText(pub.title) : undefined}
        members={c.name}
        manageHref={m && dashboardHref(m)}
      />
    );
  }
  // The browser opens an encrypted page with the password's key; the server only hands it over sealed.
  const sealed = opened && "sealed" in opened && lock ? { page: opened.sealed, lock, members: c.name } : undefined;

  // Only open pages listed on Discover in an open, indexable collection can be upvoted.
  const onDiscover = entry.listing === "discover" && access === "open" && c.indexAccess === "open" && c.indexable;
  const manageFor = me ? manageDataFor(me, [pub.id]).then((m) => m.get(pub.id)) : Promise.resolve(undefined);
  const [siblings, votes, byline, manage, views] = await Promise.all([
    liveEntries(c.id),
    onDiscover
      ? db
          .select({ n: count() })
          .from(publicationVote)
          .where(eq(publicationVote.publicationId, pub.id))
          .then(([v]) => v.n)
      : null,
    bylineFor(pub, showsAuthor(container, place)),
    manageFor,
    // Only members can read a members-only page, so a count there says nothing worth knowing.
    access === "members"
      ? null
      : manageFor.then((m) =>
          loadViewFooter({
            mode: viewsMode(container, place, entry.listing !== "unlisted"),
            countries: showsViewCountries(container, place),
            manager,
            lock: access === "password" ? pageLock(container, place) : null,
            publicationId: pub.id,
            entryId: entry.id,
            // Only someone who can change this entry: a graph manager may not be one.
            controls: m?.entries.find((e) => e.entryId === entry.id)?.canManage
              ? {
                  target: { kind: "entry", entryId: entry.id },
                  views: entry.views,
                  showViewCountries: entry.showViewCountries,
                  container: { label: c.name, views: c.views, showViewCountries: c.showViewCountries },
                  listed: entry.listing !== "unlisted",
                }
              : null,
          }),
        ),
  ]);
  // [[links]] resolve to other pages in this collection, never to unlisted ones: a link would hand
  // their address to every reader.
  const links = new PageLinks(
    siblings
      .filter(({ entry: e, pub: p }) => p.kind === "page" && e.listing !== "unlisted")
      .map(({ entry: e, pub: p }) => [p.title.toLowerCase(), entryPath(c.slug, e.entryUid, p.title)]),
    (t) => collectionTagPath(c.slug, t),
  );
  const related = siblings
    .filter(({ entry: e, pub: p }) => e.id !== entry.id && e.listing !== "unlisted" && p.tags.some((t) => pub.tags.includes(t)))
    .sort((a, b) => b.pub.updatedAt.getTime() - a.pub.updatedAt.getTime())
    .slice(0, RELATED_LIMIT)
    .map(({ entry: e, pub: p }) => ({ title: p.title, href: entryPath(c.slug, e.entryUid, p.title) }));

  return (
    <PublicationView
      pub={pub}
      sealed={sealed}
      tagBase={{ collection: c.slug }}
      path={path}
      zoom={zoom}
      crumbs={[{ label: c.name, href: collectionPath(c.slug) }, { label: plainText(pub.title) }]}
      links={links}
      related={related}
      siteSearch={await canSearchSite(me)}
      byline={byline}
      privacy={privacyNotes({ access, encrypted: pub.encrypted, unlisted: entry.listing === "unlisted", unsearchable: !pub.searchable && entry.listing === "listed", container: c.name })}
      report={{ collectionSlug: c.slug, entryUid: entry.entryUid }}
      votes={votes}
      countViews={entry.listing !== "unlisted" && access === "open"}
      views={views}
      manage={manage}
      afterUnpublish={collectionPath(c.slug)}
    />
  );
}

