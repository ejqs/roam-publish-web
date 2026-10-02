import Link from "next/link";
import { Breadcrumbs, type Crumb } from "@/components/breadcrumbs";
import { ManageDialog } from "@/components/manage/manage-dialog";
import { ReportAbuseButton, type ReportTarget } from "@/components/report-abuse-button";
import { BlockList } from "@/components/roam/block-tree";
import type { PageLinks } from "@/components/roam/markup";
import { SiteFooter } from "@/components/site-footer";
import { UpvoteButton } from "@/components/upvote-button";
import { ViewBeacon } from "@/components/view-beacon";
import type { publication } from "@/db/schema";
import type { ManageData } from "@/lib/manage-data";

export type Byline = { label: string; href?: string } | null;

/**
 * A published page, wherever it's shown: in its graph or in a collection. The caller has already
 * checked the reader may see it.
 */
export function PublicationView({
  pub,
  crumbs,
  links,
  byline,
  report,
  votes,
  countViews,
  manage,
  afterUnpublish,
}: {
  pub: typeof publication.$inferSelect;
  crumbs: Crumb[] | null;
  links: PageLinks;
  byline: Byline;
  report: ReportTarget;
  /** Upvote count when this place is on Discover; null otherwise. */
  votes: number | null;
  /** Record a view (open places only). */
  countViews: boolean;
  /** Shown to people who can manage this page. */
  manage?: ManageData;
  afterUnpublish?: string;
}) {
  const tree = pub.tree;
  return (
    <>
      <main className="relative flex-1 bg-card">
        <div className="absolute top-3 right-4 flex items-center gap-2">
          {manage && <ManageDialog data={manage} trigger="floating" afterUnpublish={afterUnpublish} />}
          <ReportAbuseButton target={report} />
        </div>
        <article className="mx-auto w-full max-w-[700px] px-4 py-16 text-[16px]">
          {crumbs && <Breadcrumbs items={crumbs} />}
          {pub.kind === "page" ? (
            <>
              <h1 className="mb-2 text-[42px] leading-tight font-semibold break-words">{pub.title}</h1>
              <BylineLine byline={byline} className="mb-6" />
              {!byline && <div className="mb-4" />}
              <BlockList nodes={tree.children} links={links} viewType={tree.viewType} />
            </>
          ) : (
            <>
              <BylineLine byline={byline} className="mb-4" />
              <BlockList nodes={[tree]} links={links} />
            </>
          )}
          <div className="mt-12 flex items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground">
              Last updated {pub.updatedAt.toLocaleDateString("en-US", { dateStyle: "medium" })}
            </p>
            {votes !== null && <UpvoteButton publicationId={pub.id} initialCount={votes} />}
          </div>
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
