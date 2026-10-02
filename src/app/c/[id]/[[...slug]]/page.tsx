import { and, asc, count, eq, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessLock, lockExplanation } from "@/components/access-lock";
import { DashboardLink } from "@/components/dashboard-link";
import { GateNotice } from "@/components/gate-notice";
import { PublicationView } from "@/components/publication-view";
import { RemovedNotice } from "@/components/removed-notice";
import { ReportAbuseButton } from "@/components/report-abuse-button";
import type { PageLinks } from "@/components/roam/markup";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { db } from "@/db";
import { collectionEntry, graph, publication, publicationVote, user } from "@/db/schema";
import { canManageEntry, collectionRole, resolveC } from "@/lib/collections";
import { type Container, containerLock, effectiveAccess, gate, pageLock, type Place, showsAuthor } from "@/lib/gates";
import { canManage, graphRole } from "@/lib/graph-access";
import { manageDataFor } from "@/lib/manage-data";
import { liveGraph } from "@/lib/moderation";
import { collectionPath, entryPath } from "@/lib/publications";
import { plainText, slugify } from "@/lib/slug";
import { bylineFor, viewerId } from "@/lib/viewer";
import { PublicationTable } from "../../../[graph]/publication-table";

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
      alternates: { canonical: collectionPath(c.slug) },
      robots: indexable ? undefined : { index: false, follow: false },
    };
  if (r.pub.removedAt || r.graphTakenDown) return { title: "Removed", robots: { index: false, follow: false } };
  const access = effectiveAccess(asContainer(c), { access: r.entry.access });
  if (access !== "open") return { title: "Protected page", robots: { index: false, follow: false } };
  return {
    title: `${plainText(r.pub.title)} · ${c.name}`,
    alternates: { canonical: entryPath(c.slug, r.entry.entryUid, r.pub.title) },
    robots: indexable && r.entry.listing !== "unlisted" ? undefined : { index: false },
  };
}

export default async function CollectionRoute(props: PageProps<"/c/[id]/[[...slug]]">) {
  const { id, slug } = await props.params;
  const route = await resolveRoute(id, slug);
  if (!route) notFound();
  if (route.r.c.takenDown) return <RemovedNotice what="collection" />;
  return route.kind === "collection" ? (
    <CollectionIndex c={route.r.c} />
  ) : (
    <EntryPage r={route.r} rest={route.rest} />
  );
}

async function CollectionIndex({ c }: { c: C }) {
  const me = await viewerId();
  const role = me ? await collectionRole(me, c.id) : null;
  const container = asContainer(c);
  const blocker = await gate(c.indexAccess, containerLock(container), { member: !!role, manager: false, signedIn: !!me });
  if (blocker) return <GateNotice blocker={blocker} what="collection" next={collectionPath(c.slug)} />;

  const rows = (await liveEntries(c.id)).filter(({ entry }) => entry.listing !== "unlisted");
  const items = await Promise.all(
    rows.map(async ({ entry, pub }) => ({
      href: entryPath(c.slug, entry.entryUid, pub.title),
      lock: lockExplanation(effectiveAccess(container, entry), "collection", c.name),
      author: (await bylineFor(pub, showsAuthor(container, entry)))?.label,
      rootUid: entry.entryUid,
      kind: pub.kind,
      title: pub.title,
      createdAt: entry.addedAt.toISOString(),
      updatedAt: pub.updatedAt.toISOString(),
    })),
  );

  return (
    <>
      <main className="relative flex-1 bg-card">
        <div className="absolute top-3 right-4 flex items-center gap-1">
          <DashboardLink href={role ? `/dashboard/collections/${encodeURIComponent(c.slug)}` : undefined} />
          <ReportAbuseButton target={{ collectionSlug: c.slug }} />
          <ThemeToggle size="icon-sm" className="text-muted-foreground" />
        </div>
        <div className="mx-auto w-full max-w-[700px] px-4 py-16">
          <p className="mb-2 text-sm text-muted-foreground">Collection</p>
          <h1 className="mb-1 text-[42px] leading-tight font-semibold break-words">
            {c.name} <AccessLock access={c.indexAccess} what="collection" name={c.name} />
          </h1>
          {c.description && <p className="mt-1 mb-2 text-foreground/80 break-words">{c.description}</p>}
          <p className="mb-8 text-sm text-muted-foreground">
            {items.length} {items.length === 1 ? "page" : "pages"}
          </p>
          {items.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>No pages yet</EmptyTitle>
                <EmptyDescription>Check back later.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            // In the owner's order, on one page.
            <PublicationTable rows={items} sort="updated" page={1} pageCount={1} sortable={false} />
          )}
        </div>
      </main>
      <SiteFooter className="bg-card" />
    </>
  );
}

async function EntryPage({ r, rest }: { r: Entry; rest: string[] }) {
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
  const blocker = await gate(access, pageLock(container, place), { member: !!cRole, manager, signedIn: !!me });
  if (blocker)
    return (
      <GateNotice
        blocker={blocker}
        what="page"
        next={path}
        title={entry.listing !== "unlisted" && c.indexAccess === "open" ? plainText(pub.title) : undefined}
      />
    );

  // Only open pages listed on Discover in an open, indexable collection can be upvoted.
  const onDiscover = entry.listing === "discover" && access === "open" && c.indexAccess === "open" && c.indexable;
  const [siblings, votes, byline, manage] = await Promise.all([
    liveEntries(c.id),
    onDiscover
      ? db
          .select({ n: count() })
          .from(publicationVote)
          .where(eq(publicationVote.publicationId, pub.id))
          .then(([v]) => v.n)
      : null,
    bylineFor(pub, showsAuthor(container, place)),
    me ? manageDataFor(me, [pub.id]).then((m) => m.get(pub.id)) : undefined,
  ]);
  // [[links]] resolve to other pages in this collection.
  const links: PageLinks = new Map(
    siblings
      .filter(({ pub: p }) => p.kind === "page")
      .map(({ entry: e, pub: p }) => [p.title.toLowerCase(), entryPath(c.slug, e.entryUid, p.title)]),
  );

  return (
    <PublicationView
      pub={pub}
      crumbs={[{ label: c.name, href: collectionPath(c.slug) }, { label: plainText(pub.title) }]}
      links={links}
      byline={byline}
      report={{ collectionSlug: c.slug, entryUid: entry.entryUid }}
      votes={votes}
      countViews={entry.listing !== "unlisted" && access === "open"}
      manage={manage}
      afterUnpublish={collectionPath(c.slug)}
    />
  );
}

