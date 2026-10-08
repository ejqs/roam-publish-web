import Link from "next/link";
import { plainText } from "@/lib/slug";
import { Breadcrumbs, type Crumb } from "@/components/breadcrumbs";
import { DashboardLink } from "@/components/dashboard-link";
import { QuickSearch } from "@/components/quick-search";
import { ManageDialog } from "@/components/manage/manage-dialog";
import { PrivacyBadges } from "@/components/privacy-badges";
import type { PrivacyNote } from "@/components/privacy-icons";
import { ReportAbuseButton, type ReportTarget } from "@/components/report-abuse-button";
import { BlockList } from "@/components/roam/block-tree";
import { PageOutlineAside, PageOutlineDetails } from "@/components/roam/page-outline";
import { blockComponent, type PageLinks, RoamText } from "@/components/roam/markup";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { UpvoteButton } from "@/components/upvote-button";
import { ViewBeacon } from "@/components/view-beacon";
import { PasswordViewsWarning, ViewCount } from "@/components/view-count";
import type { publication } from "@/db/schema";
import { headingsOf, zoomPath } from "@/lib/headings";
import { zoomHref } from "@/lib/publications";
import type { ManageData } from "@/lib/manage-data";
import type { ViewFooter } from "@/lib/views-data";

/** A block's text as a breadcrumb: plain, and cut short so a long block doesn't take the whole trail. */
const crumbLabel = (s: string) => {
  const t = plainText(s) || "Untitled";
  return t.length > 40 ? `${t.slice(0, 39).trimEnd()}…` : t;
};

export type Byline = { label: string; href?: string } | null;

/**
 * A published page, wherever it's shown: in its graph or in a collection. The caller has already
 * checked the reader may see it.
 */
export function PublicationView({
  pub,
  path,
  zoom,
  crumbs,
  links,
  related = [],
  siteSearch,
  byline,
  report,
  votes,
  countViews,
  views = null,
  manage,
  afterUnpublish,
  privacy = [],
}: {
  pub: typeof publication.$inferSelect;
  /** This page's own address, for leaving a zoomed-in view. */
  path: string;
  /** The block the reader zoomed into (`?block=`), if any. */
  zoom?: string;
  crumbs: Crumb[] | null;
  links: PageLinks;
  /** Whether the viewer may search the whole site. */
  siteSearch: boolean;
  /** Other listed pages sharing a tag with this one. */
  related?: { title: string; href: string }[];
  byline: Byline;
  report: ReportTarget;
  /** Upvote count when this place is on Discover; null otherwise. */
  votes: number | null;
  /** Record a view (open places only). */
  countViews: boolean;
  /** The view count in the footer, when this reader gets one (lib/views-data.ts). */
  views?: ViewFooter | null;
  /** Shown to people who can manage this page. */
  manage?: ManageData;
  afterUnpublish?: string;
  /** Whether it's protected or not listed, told to the reader next to the title. */
  privacy?: PrivacyNote[];
}) {
  const tree = pub.tree;
  const top = pub.kind === "page" ? tree.children : [tree];
  // Zoomed into a block below the top, like Roam: that block alone, under a trail back up the page.
  const zoomed = zoom && zoom !== tree.uid ? zoomPath(top, zoom) : null;
  const zoomNode = zoomed?.at(-1);
  const zoomViewType = zoomed && zoomed.length > 1 ? zoomed.at(-2)!.viewType : pub.kind === "page" ? tree.viewType : undefined;
  // An outline only helps once there's more than one heading to move between.
  const headings = headingsOf(zoomNode ? zoomNode.children : top);
  const outline = headings.length > 1 ? headings : null;
  const tagHref = links.tagHref;
  const tags =
    pub.kind === "page" && tagHref && pub.tags.length > 0 ? (
      <p className="mb-6 flex flex-wrap gap-x-2 text-sm">
        {pub.tags.map((t) => (
          <Link key={t} href={tagHref(t)} className="text-roam-ref hover:underline">
            #{t}
          </Link>
        ))}
      </p>
    ) : null;
  return (
    <>
      <main className="relative flex-1 bg-card">
        <div className="absolute top-3 right-4 left-4 flex items-center justify-end gap-1">
          <QuickSearch siteSearch={siteSearch} />
          <DashboardLink href={manage ? dashboardHref(manage) : undefined} />
          {manage && <ManageDialog data={manage} trigger="floating" afterUnpublish={afterUnpublish} />}
          <ReportAbuseButton target={report} />
          <ThemeToggle size="icon-sm" className="text-muted-foreground" />
        </div>
        <article className="relative mx-auto w-full max-w-[700px] px-4 py-16 text-[16px]">
          {outline && (
            <PageOutlineAside headings={outline} className="absolute top-16 right-full bottom-16 hidden w-60 pr-6 xl:block" />
          )}
          {zoomed && zoomNode ? (
            <>
              {/* One trail: the site's crumbs, the page (leaving the zoom), then the blocks above this one. */}
              <Breadcrumbs
                className="mb-3"
                items={[
                  ...(crumbs ?? [{ label: plainText(pub.kind === "page" ? pub.title : tree.string) || "Untitled" }]).map((c, i, all) =>
                    i === all.length - 1 ? { ...c, href: path } : c,
                  ),
                  ...zoomed.slice(0, -1).map((n) => ({ label: crumbLabel(n.string), href: zoomHref(n.uid) })),
                  { label: crumbLabel(zoomNode.string) },
                ]}
              />
              {outline && <PageOutlineDetails headings={outline} className="mb-4 xl:hidden" />}
              {zoomNode.embed || blockComponent(zoomNode.string) ? (
                <BlockList nodes={[{ ...zoomNode, collapsed: undefined }]} links={links} viewType={zoomViewType} anchors />
              ) : (
                <>
                  {/* Like Roam, the block zoomed into reads as the title, with its children below it. */}
                  <h1 className="mb-6 text-[26px] sm:text-[32px] leading-tight font-semibold break-words whitespace-pre-wrap">
                    <RoamText text={zoomNode.string} links={links} />
                    <PrivacyBadges notes={privacy} className="ml-2 inline-flex flex-wrap gap-1 align-middle" />
                  </h1>
                  <BlockList nodes={zoomNode.children} links={links} viewType={zoomNode.viewType} anchors />
                </>
              )}
            </>
          ) : pub.kind === "page" ? (
            <>
              {crumbs && <Breadcrumbs items={crumbs} />}
              <h1 className="mb-2 text-[32px] sm:text-[42px] leading-tight font-semibold break-words">
                {pub.title}
                <PrivacyBadges notes={privacy} className="ml-2 inline-flex flex-wrap gap-1 align-middle" />
              </h1>
              <BylineLine byline={byline} className={tags ? "mb-2" : "mb-6"} />
              {tags}
              {!byline && !tags && <div className="mb-4" />}
              {outline && <PageOutlineDetails headings={outline} className="mb-4 xl:hidden" />}
              <BlockList nodes={tree.children} links={links} viewType={tree.viewType} anchors />
            </>
          ) : (
            <>
              {crumbs && <Breadcrumbs items={crumbs} />}
              <PrivacyBadges notes={privacy} className="mb-3 flex flex-wrap gap-1" />
              <BylineLine byline={byline} className="mb-4" />
              {outline && <PageOutlineDetails headings={outline} className="mb-4 xl:hidden" />}
              <BlockList nodes={[tree]} links={links} anchors />
            </>
          )}
          {related.length > 0 && (
            <section aria-labelledby="related" className="mt-12 border-t pt-4 text-sm">
              <h2 id="related" className="mb-3 font-semibold">
                More with {pub.tags.length === 1 ? "this tag" : "these tags"}
              </h2>
              <ul className="flex flex-col gap-2">
                {related.map((r) => (
                  <li key={r.href}>
                    <Link href={r.href} className="text-link hover:underline">
                      {plainText(r.title) || "Untitled"}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="mt-12 flex items-center justify-between gap-4">
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
              <span>Last updated {pub.updatedAt.toLocaleDateString("en-US", { dateStyle: "medium" })}</span>
              {views && (
                <>
                  <span aria-hidden>·</span>
                  <ViewCount v={views} />
                </>
              )}
            </p>
            {votes !== null && <UpvoteButton publicationId={pub.id} initialCount={votes} />}
          </div>
          {views?.passwordWarning && <PasswordViewsWarning v={views} />}
        </article>
        {countViews && <ViewBeacon publicationId={pub.id} />}
      </main>
      <SiteFooter className="bg-card" />
    </>
  );
}

function BylineLine({ byline, className }: { byline: Byline; className?: string }) {
  if (!byline) return null;
  return (
    <p className={`text-sm text-muted-foreground ${className ?? ""}`}>
      By{" "}
      {byline.href ? (
        <Link href={byline.href} className="hover:text-foreground hover:underline">
          {byline.label}
        </Link>
      ) : (
        byline.label
      )}
    </p>
  );
}

/** The dashboard list this page sits in: its graph's, or else the first collection the viewer manages it in. */
export function dashboardHref(m: ManageData) {
  if (m.canManagePage) return `/dashboard/${encodeURIComponent(m.origin.graphName)}#pub-${m.publicationId}`;
  const e = m.entries.find((x) => x.canManage);
  return e ? `/dashboard/collections/${encodeURIComponent(e.collectionSlug)}` : "/dashboard";
}
