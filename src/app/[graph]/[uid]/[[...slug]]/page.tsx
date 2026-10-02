import { and, count, desc, eq, ne } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { GateNotice } from "@/components/gate-notice";
import { PageLinks } from "@/components/roam/markup";
import { PublicationView } from "@/components/publication-view";
import { RemovedNotice } from "@/components/removed-notice";
import { db } from "@/db";
import { publication, publicationVote } from "@/db/schema";
import { isListed } from "@/lib/discover";
import { type Container, effectiveAccess, gate, pageLock, type Place, showsAuthor } from "@/lib/gates";
import { canManage, graphRole } from "@/lib/graph-access";
import { graphPath, loadGraph } from "@/lib/graphs";
import { tagsOverlap } from "@/lib/list-query";
import { manageDataFor } from "@/lib/manage-data";
import { livePublication } from "@/lib/moderation";
import { publicProfile } from "@/lib/profiles";
import { publicationPath } from "@/lib/publications";
import { plainText, slugify } from "@/lib/slug";
import { graphTagPath, RELATED_LIMIT } from "@/lib/tag-paths";
import { bylineFor, viewerId } from "@/lib/viewer";

// Only graph + uid identify a publication; the optional trailing slug is decorative.
const load = cache(async (graphName: string, rootUid: string) => {
  const g = await loadGraph(graphName);
  if (!g) return null;
  const pub = await db.query.publication.findFirst({
    where: and(eq(publication.graphId, g.id), eq(publication.rootUid, rootUid)),
  });
  // A page shown only in collections has no graph place.
  if (!pub || !pub.inGraph) return null;
  const container: Container = { ...g, kind: "graph" };
  const place: Place = { ...pub, kind: "publication" };
  return { g, pub, container, place, access: effectiveAccess(container, place) };
});

export async function generateMetadata(props: PageProps<"/[graph]/[uid]/[[...slug]]">): Promise<Metadata> {
  const { graph: graphName, uid } = await props.params;
  const data = await load(decodeURIComponent(graphName), decodeURIComponent(uid));
  if (!data) return { title: "Not found" };
  if (data.g.takenDown || data.pub.removedAt)
    return { title: "Removed", robots: { index: false, follow: false } };
  // Protected pages never show their title in metadata and are never indexed.
  if (data.access !== "open") return { title: "Protected page", robots: { index: false, follow: false } };
  return {
    title: `${plainText(data.pub.title)} · ${data.g.name}`,
    alternates: { canonical: publicationPath(data.g.name, data.pub.rootUid, data.pub.title) },
    // Unlisted pages are link-only; public ones follow the graph's indexing setting.
    robots:
      data.pub.visibility === "public" && data.g.indexable && data.g.indexAccess === "open" ? undefined : { index: false },
  };
}

export default async function PublishedPage(props: PageProps<"/[graph]/[uid]/[[...slug]]">) {
  const { graph: graphName, uid, slug } = await props.params;
  const data = await load(decodeURIComponent(graphName), decodeURIComponent(uid));
  if (!data) notFound();
  const { g, pub, container, place, access } = data;
  if (g.takenDown) return <RemovedNotice what="graph" />;
  if (pub.removedAt) return <RemovedNotice what="page" />;

  // The slug is decorative. A bare /{graph}/{uid} stays as-is; any slug that doesn't match the
  // current title is corrected. Temporary redirect, since the title can change on republish.
  const path = publicationPath(g.name, pub.rootUid, pub.title);
  if (slug && (slug.length !== 1 || slug[0] !== slugify(pub.title))) redirect(path);

  const me = await viewerId();
  const role = me ? await graphRole(me, g.id) : null;
  const manager = !!me && canManage(role, me, pub);
  const blocker = await gate(access, pageLock(container, place), { member: !!role, manager, signedIn: !!me });
  if (blocker)
    return (
      <GateNotice
        blocker={blocker}
        what="page"
        next={path}
        title={pub.visibility === "public" && g.indexAccess === "open" ? plainText(pub.title) : undefined}
      />
    );

  const showBreadcrumbs = pub.visibility === "public" || !g.hideUnlistedBreadcrumbs;
  // Only open pages listed on Discover can be upvoted.
  const listed = access === "open" && isListed(g, pub);
  // Tags lead to the graph's front page, unless that would reveal a graph the page hides.
  const tagsBrowsable = showBreadcrumbs && g.frontPage;
  const [pages, owner, votes, byline, manage, related] = await Promise.all([
    db
      .select({ title: publication.title, rootUid: publication.rootUid })
      .from(publication)
      .where(
        and(eq(publication.graphId, g.id), eq(publication.kind, "page"), eq(publication.inGraph, true), livePublication),
      ),
    showBreadcrumbs && g.showOwner ? publicProfile(g.userId) : null,
    listed
      ? db
          .select({ n: count() })
          .from(publicationVote)
          .where(eq(publicationVote.publicationId, pub.id))
          .then(([r]) => r.n)
      : null,
    bylineFor(pub, showsAuthor(container, place)),
    me ? manageDataFor(me, [pub.id]).then((m) => m.get(pub.id)) : undefined,
    tagsBrowsable && pub.tags.length
      ? db
          .select({ title: publication.title, rootUid: publication.rootUid })
          .from(publication)
          .where(
            and(
              eq(publication.graphId, g.id),
              eq(publication.inGraph, true),
              eq(publication.visibility, "public"),
              livePublication,
              ne(publication.id, pub.id),
              tagsOverlap(pub.tags),
            ),
          )
          .orderBy(desc(publication.updatedAt))
          .limit(RELATED_LIMIT)
      : [],
  ]);
  const tagHref = tagsBrowsable ? (t: string) => graphTagPath(g.name, t) : undefined;
  const links = new PageLinks(
    pages.map((p) => [p.title.toLowerCase(), publicationPath(g.name, p.rootUid, p.title)]),
    tagHref,
  );

  return (
    <PublicationView
      pub={pub}
      crumbs={
        showBreadcrumbs
          ? [
              ...(owner ? [{ label: `@${owner.username}`, href: `/u/${owner.username}` }] : []),
              { label: g.name, href: g.frontPage ? graphPath(g.name) : undefined },
              { label: plainText(pub.title) },
            ]
          : null
      }
      links={links}
      related={related.map((r) => ({ title: r.title, href: publicationPath(g.name, r.rootUid, r.title) }))}
      byline={byline}
      report={{ graphName: g.name, rootUid: pub.rootUid }}
      votes={votes}
      countViews={pub.visibility === "public" && access === "open"}
      manage={manage}
      afterUnpublish="/dashboard"
    />
  );
}
