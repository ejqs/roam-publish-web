import Link from "next/link";
import { plainText } from "@/lib/slug";
import type { Crumb } from "@/components/breadcrumbs";
import { DashboardLink } from "@/components/dashboard-link";
import { EncryptedBody, type TagBase } from "@/components/encrypted-body";
import { QuickSearch } from "@/components/quick-search";
import { ManageDialog } from "@/components/manage/manage-dialog";
import { type PdfOffer, PdfDownloadButton, PdfMasthead } from "@/components/pdf-download";
import type { PrivacyNote } from "@/components/privacy-icons";
import { type BodyProps, type Byline, PublicationBody } from "@/components/publication-body";
import { ReportAbuseButton, type ReportTarget } from "@/components/report-abuse-button";
import { FoldAllRoot } from "@/components/roam/collapsible-row";
import type { PageLinks } from "@/components/roam/markup";
import { SiteFooter } from "@/components/site-footer";
import { ThemeToggle } from "@/components/theme-toggle";
import { UpvoteButton } from "@/components/upvote-button";
import { ViewBeacon } from "@/components/view-beacon";
import { PasswordViewsWarning, ViewCount } from "@/components/view-count";
import type { publication } from "@/db/schema";
import type { SealedPage } from "@/lib/reader-crypto";
import type { Lock } from "@/lib/gates";
import type { ManageData } from "@/lib/manage-data";
import type { ViewFooter } from "@/lib/views-data";

export type { Byline } from "@/components/publication-body";

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
  sealed,
  tagBase,
  pdf,
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
  /**
   * An encrypted page, still sealed: the reader's browser opens it with the password's key and
   * renders its body there. `pub.tree` is empty then.
   */
  sealed?: { page: SealedPage; lock: Lock; members?: string };
  /** Where #tags lead, for a body rendered in the browser (links' `tagHref` can't travel there). */
  tagBase?: TagBase;
  /** Download PDF, when this place offers it (lib/pdf.ts). */
  pdf?: PdfOffer;
}) {
  const bodyProps: BodyProps = { kind: pub.kind, title: pub.title, tags: pub.tags, path, zoom, crumbs, byline, privacy };
  return (
    <>
      <main className="relative flex-1 bg-card">
        <FoldAllRoot>
          <div className="absolute top-3 right-4 left-4 z-10 flex items-center justify-end gap-1 pdf:hidden">
            <QuickSearch siteSearch={siteSearch} />
            {pdf && <PdfDownloadButton offer={pdf} />}
            <DashboardLink href={manage ? dashboardHref(manage) : undefined} />
            {manage && <ManageDialog data={manage} trigger="floating" afterUnpublish={afterUnpublish} />}
            <ReportAbuseButton target={report} />
            <ThemeToggle size="icon-sm" className="text-muted-foreground" />
          </div>
          <article data-pdf-article={pdf ? "" : undefined} className="relative mx-auto w-full max-w-[700px] px-4 py-16 text-[16px]">
            {pdf && <PdfMasthead offer={pdf} />}
            {sealed ? (
              <EncryptedBody {...sealed} body={bodyProps} links={[...links]} tagBase={tagBase} />
            ) : (
              <PublicationBody {...bodyProps} tree={pub.tree} links={links} />
            )}
            {related.length > 0 && (
              <section aria-labelledby="related" className="mt-12 border-t pt-4 text-sm pdf:hidden">
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
            <div className="mt-12 flex items-center justify-between gap-4 pdf:hidden">
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
            {views?.passwordWarning && (
              <div className="pdf:hidden">
                <PasswordViewsWarning v={views} />
              </div>
            )}
          </article>
          {countViews && <ViewBeacon publicationId={pub.id} />}
        </FoldAllRoot>
      </main>
      <SiteFooter className="bg-card" />
    </>
  );
}

/** The dashboard list this page sits in: its graph's, or else the first collection the viewer manages it in. */
export function dashboardHref(m: ManageData) {
  if (m.canManagePage) return `/dashboard/${encodeURIComponent(m.origin.graphName)}#pub-${m.publicationId}`;
  const e = m.entries.find((x) => x.canManage);
  return e ? `/dashboard/collections/${encodeURIComponent(e.collectionSlug)}` : "/dashboard";
}
