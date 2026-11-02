import "server-only";
import { and, count, desc, eq, isNull, ne } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GateNotice } from "@/components/gate-notice";
import { privacyNotes } from "@/components/privacy-icons";
import { PageLinks } from "@/components/roam/markup";
import { dashboardHref, PublicationView } from "@/components/publication-view";
import { RemovedNotice } from "@/components/removed-notice";
import { db } from "@/db";
import { publication, publicationVote } from "@/db/schema";
import { isListed } from "@/lib/discover";
import {
  type Container,
  effectiveAccess,
  gate,
  pageLock,
  type Place,
  showsAuthor,
  showsViewCountries,
  viewsMode,
} from "@/lib/gates";
import { canManage, canSearchSite, graphRole } from "@/lib/graph-access";
import { graphPath, loadGraph } from "@/lib/graphs";
import { tagsOverlap } from "@/lib/list-query";
import { readEncrypted } from "@/lib/encryption";
import { cardVersion, previewMetadata } from "@/lib/link-preview";
import { manageDataFor } from "@/lib/manage-data";
import { cardFor, linkCardPath, pageCardPath } from "@/lib/og/card";
import { livePublication } from "@/lib/moderation";
import { pdfOffer } from "@/lib/pdf";
import { publicProfile } from "@/lib/profiles";
import { placePath, publicationPath } from "@/lib/publications";
import { plainText, slugify } from "@/lib/slug";
import { graphTagPath, RELATED_LIMIT } from "@/lib/tag-paths";
import { bylineFor, viewerId } from "@/lib/viewer";
import { loadViewFooter } from "@/lib/views-data";

export type GraphPlace = {
  g: NonNullable<Awaited<ReturnType<typeof loadGraph>>>;
  pub: typeof publication.$inferSelect;
  container: Container;
  place: Place;
  access: ReturnType<typeof effectiveAccess>;
};

/** A page in its graph, when it's shown there. */
export function graphPlace(g: GraphPlace["g"] | null | undefined, pub: GraphPlace["pub"] | null | undefined): GraphPlace | null {
  // A page shown only in collections has no graph place.
  if (!g || !pub || !pub.inGraph) return null;
  const container: Container = { ...g, kind: "graph" };
  const place: Place = { ...pub, kind: "publication" };
  return { g, pub, container, place, access: effectiveAccess(container, place) };
}

/**
 * The metadata of a page in its graph. An Unlisted page (at /l/{linkId}) never names its graph:
 * not in the title, the preview's site name or card, or the card image's address.
 */
export async function graphPageMetadata(data: GraphPlace | null): Promise<Metadata> {
  if (!data) return { title: "Not found" };
  if (data.g.takenDown || data.pub.removedAt)
    return { title: "Removed", robots: { index: false, follow: false } };
  const unnamed = data.pub.visibility === "unlisted";
  const path = placePath(data.g.name, data.pub);
  const card = await cardFor(data.pub, {
    container: unnamed ? null : data.g.name,
    access: data.access,
    showAuthor: showsAuthor(data.container, data.place),
  });
  const v = cardVersion(card);
  const image = unnamed ? linkCardPath(data.pub.linkId, v) : pageCardPath(data.g.name, data.pub.rootUid, v);
  const preview = previewMetadata(card, { path, image });
  // Protected pages never show their title in metadata and are never indexed.
  if (data.access !== "open") return { ...preview, title: "Protected page", robots: { index: false, follow: false } };
  return {
    ...preview,
    title: `${plainText(data.pub.title)} · ${unnamed ? "Roam Publish" : data.g.name}`,
    alternates: { canonical: path },
    // Unlisted pages are link-only; public ones follow the graph's indexing setting.
    robots:
      data.pub.visibility === "public" && data.g.indexable && data.g.indexAccess === "open" ? undefined : { index: false },
  };
}

/**
 * A published page in its graph. Public pages live at /{graph}/{uid}/{title}; Unlisted ones at
 * /l/{linkId}/{title}, without breadcrumbs, tags or anything else that names the graph. `slug` is
 * the address's title part: a missing one stays as-is, and one that doesn't match the current title
 * is corrected (temporarily, since the title can change on republish).
 */
export async function GraphPage({ data, slug, zoom }: { data: GraphPlace; slug: string[] | undefined; zoom?: string }) {
  const { g, pub, container, place, access } = data;
  if (g.takenDown) return <RemovedNotice what="graph" />;
  if (pub.removedAt) return <RemovedNotice what="page" />;
  const unnamed = pub.visibility === "unlisted";
  const path = placePath(g.name, pub);
  if (slug && (slug.length !== 1 || slug[0] !== slugify(pub.title))) redirect(path);

  const me = await viewerId();
  const role = me ? await graphRole(me, g.id) : null;
  const manager = !!me && canManage(role, me, pub);
  const lock = pageLock(container, place);
  // An encrypted page can't be read without its password, whoever the reader is.
  const opened = pub.encrypted ? await readEncrypted(pub, access, lock) : null;
  const blocker = opened ? ("blocker" in opened ? opened.blocker : null) : await gate(access, lock, { member: !!role, manager, signedIn: !!me });
  if (blocker) {
    const m = manager && me ? (await manageDataFor(me, [pub.id])).get(pub.id) : undefined;
    return (
      <GateNotice
        blocker={blocker}
        what="page"
        next={path}
        title={pub.visibility === "public" && g.indexAccess === "open" ? plainText(pub.title) : undefined}
        members={unnamed ? undefined : g.name}
        manageHref={m && dashboardHref(m)}
      />
    );
  }
  // The browser opens an encrypted page with the password's key; the server only hands it over sealed.
  const sealed = opened && "sealed" in opened && lock ? { page: opened.sealed, lock, members: unnamed ? undefined : g.name } : undefined;

  // Unlisted pages don't name their graph: no breadcrumbs, profile link or graph tag pages.
  const showBreadcrumbs = !unnamed;
  // Only open pages listed on Discover can be upvoted.
  const listed = access === "open" && isListed(g, pub);
  // Tags lead to the graph's front page, unless that would reveal a graph the page hides.
  const tagsBrowsable = showBreadcrumbs && g.frontPage;
  const manageFor = me ? manageDataFor(me, [pub.id]).then((m) => m.get(pub.id)) : Promise.resolve(undefined);
  const [pages, owner, votes, byline, manage, related, views] = await Promise.all([
    db
      .select({ title: publication.title, rootUid: publication.rootUid })
      .from(publication)
      .where(
        and(
          eq(publication.graphId, g.id),
          eq(publication.kind, "page"),
          eq(publication.inGraph, true),
          // [[links]] never lead to unlisted pages: a link would hand their address to every reader.
          eq(publication.visibility, "public"),
          // Nor to pages whose title is encrypted: roam.pub doesn't know it.
          isNull(publication.titleCipher),
          livePublication,
        ),
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
    manageFor,
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
    // Only members can read a members-only page, so a count there says nothing worth knowing.
    access === "members"
      ? null
      : manageFor.then((m) =>
          loadViewFooter({
            mode: viewsMode(container, place, pub.visibility === "public"),
            countries: showsViewCountries(container, place),
            manager,
            lock: access === "password" ? pageLock(container, place) : null,
            publicationId: pub.id,
            controls: m?.canManagePage
              ? {
                  target: { kind: "graph", publicationId: pub.id },
                  views: pub.views,
                  showViewCountries: pub.showViewCountries,
                  container: { label: g.name, views: g.views, showViewCountries: g.showViewCountries },
                  listed: pub.visibility === "public",
                }
              : null,
          }),
        ),
  ]);
  const tagHref = tagsBrowsable ? (t: string) => graphTagPath(g.name, t) : undefined;
  const links = new PageLinks(
    pages.map((p) => [p.title.toLowerCase(), publicationPath(g.name, p.rootUid, p.title)]),
    tagHref,
  );

  return (
    <PublicationView
      pub={pub}
      sealed={sealed}
      tagBase={tagsBrowsable ? { graph: g.name } : null}
      path={path}
      zoom={zoom}
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
      siteSearch={await canSearchSite(me)}
      related={related.map((r) => ({ title: r.title, href: publicationPath(g.name, r.rootUid, r.title) }))}
      byline={byline}
      privacy={privacyNotes({ access, encrypted: pub.encrypted, encryption: { version: pub.encryptionVersion, by: pub.encryptedBy }, listing: pub.visibility === "unlisted" ? "unlisted" : listed ? "discover" : "listed", showListing: g.showVisibility, unsearchable: !pub.searchable && !(pub.discoverable && access === "open"), container: unnamed ? null : g.name })}
      report={unnamed ? { linkId: pub.linkId } : { graphName: g.name, rootUid: pub.rootUid }}
      votes={votes}
      countViews={pub.visibility === "public" && access === "open"}
      views={views}
      manage={manage}
      afterUnpublish="/dashboard"
      pdf={pdfOffer(g, pub, { path, source: unnamed ? "" : g.name, access, updatedAt: pub.updatedAt, author: byline?.label })}
    />
  );
}
