import { and, count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { BlockList } from "@/components/roam/block-tree";
import type { PageLinks } from "@/components/roam/markup";
import { RemovedNotice } from "@/components/removed-notice";
import { ReportAbuseButton } from "@/components/report-abuse-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { SiteFooter } from "@/components/site-footer";
import { UpvoteButton } from "@/components/upvote-button";
import { ViewBeacon } from "@/components/view-beacon";
import { db } from "@/db";
import { publication, publicationVote } from "@/db/schema";
import { isListed } from "@/lib/discover";
import { graphPath, loadGraph } from "@/lib/graphs";
import { livePublication } from "@/lib/moderation";
import { publicProfile } from "@/lib/profiles";
import { publicationPath } from "@/lib/publications";
import { plainText, slugify } from "@/lib/slug";

// Only graph + uid identify a publication; the optional trailing slug is decorative.
const load = cache(async (graphName: string, rootUid: string) => {
  const g = await loadGraph(graphName);
  if (!g) return null;
  const pub = await db.query.publication.findFirst({
    where: and(eq(publication.graphId, g.id), eq(publication.rootUid, rootUid)),
  });
  if (!pub) return null;
  return { g, pub };
});

export async function generateMetadata(props: PageProps<"/[graph]/[uid]/[[...slug]]">): Promise<Metadata> {
  const { graph: graphName, uid } = await props.params;
  const data = await load(decodeURIComponent(graphName), decodeURIComponent(uid));
  if (!data) return { title: "Not found" };
  if (data.g.takenDown || data.pub.removedAt)
    return { title: "Removed", robots: { index: false, follow: false } };
  return {
    title: `${plainText(data.pub.title)} · ${data.g.name}`,
    alternates: { canonical: publicationPath(data.g.name, data.pub.rootUid, data.pub.title) },
    // Unlisted pages are link-only; public ones follow the graph's indexing setting.
    robots: data.pub.visibility === "public" && data.g.indexable ? undefined : { index: false },
  };
}

export default async function PublishedPage(props: PageProps<"/[graph]/[uid]/[[...slug]]">) {
  const { graph: graphName, uid, slug } = await props.params;
  const data = await load(decodeURIComponent(graphName), decodeURIComponent(uid));
  if (!data) notFound();
  const { g, pub } = data;
  if (g.takenDown) return <RemovedNotice what="graph" />;
  if (pub.removedAt) return <RemovedNotice what="page" />;

  // The slug is decorative. A bare /{graph}/{uid} stays as-is; any slug that doesn't match the
  // current title is corrected. Temporary redirect, since the title can change on republish.
  if (slug && (slug.length !== 1 || slug[0] !== slugify(pub.title))) {
    redirect(publicationPath(g.name, pub.rootUid, pub.title));
  }

  const showBreadcrumbs = pub.visibility === "public" || !g.hideUnlistedBreadcrumbs;
  // Only pages listed on Discover can be upvoted.
  const listed = isListed(g, pub);
  const [pages, owner, votes] = await Promise.all([
    db
      .select({ title: publication.title, rootUid: publication.rootUid })
      .from(publication)
      .where(and(eq(publication.graphId, g.id), eq(publication.kind, "page"), livePublication)),
    showBreadcrumbs && g.showOwner ? publicProfile(g.userId) : null,
    listed
      ? db
          .select({ n: count() })
          .from(publicationVote)
          .where(eq(publicationVote.publicationId, pub.id))
          .then(([r]) => r.n)
      : 0,
  ]);
  const links: PageLinks = new Map(
    pages.map((p) => [p.title.toLowerCase(), publicationPath(g.name, p.rootUid, p.title)]),
  );

  const tree = pub.tree;
  return (
    <>
      <main className="relative flex-1 bg-card">
        <div className="absolute top-3 right-4 flex items-center gap-1">
          <ReportAbuseButton target={{ graphName: g.name, rootUid: pub.rootUid }} />
          <ThemeToggle size="icon-sm" className="text-muted-foreground" />
        </div>
        <article className="mx-auto w-full max-w-[700px] px-4 py-16 text-[16px]">
          {showBreadcrumbs && (
            <Breadcrumbs
              items={[
                ...(owner ? [{ label: `@${owner.username}`, href: `/u/${owner.username}` }] : []),
                { label: g.name, href: g.frontPage ? graphPath(g.name) : undefined },
                { label: plainText(pub.title) },
              ]}
            />
          )}
          {pub.kind === "page" ? (
            <>
              <h1 className="mb-6 text-[42px] leading-tight font-semibold break-words">{pub.title}</h1>
              <BlockList nodes={tree.children} links={links} viewType={tree.viewType} />
            </>
          ) : (
            <BlockList nodes={[tree]} links={links} />
          )}
          <div className="mt-12 flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              Last updated {pub.updatedAt.toLocaleDateString("en-US", { dateStyle: "medium" })}
            </p>
            {listed && <UpvoteButton publicationId={pub.id} initialCount={votes} />}
          </div>
        </article>
        {pub.visibility === "public" && <ViewBeacon publicationId={pub.id} />}
      </main>
      <SiteFooter className="bg-card" />
    </>
  );
}

