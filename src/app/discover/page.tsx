import type { Metadata } from "next";
import { headers } from "next/headers";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { auth } from "@/lib/auth";
import { discoverCollections, discoverPublications, discoverTags, ownListedCount } from "@/lib/discover";
import { PAGE_SIZE, parsePage, parseSort } from "@/lib/discover-sort";
import { DISCOVER_FEED_PATH } from "@/lib/feeds";
import { DiscoverHeader } from "./discover-header";
import { DiscoverList, DiscoverToolbar } from "./discover-list";

export const metadata: Metadata = {
  title: "Discover · Roam Publish",
  description: "Recently published and trending pages from Roam graphs whose owners opted in.",
  alternates: { types: { "application/rss+xml": DISCOVER_FEED_PATH } },
};

export default async function DiscoverPage(props: PageProps<"/discover">) {
  const search = await props.searchParams;
  const sort = parseSort(search.sort);
  const page = parsePage(search.page);
  const session = await auth.api.getSession({ headers: await headers() });
  const [{ total, rows }, collections, tags, ownListed] = await Promise.all([
    discoverPublications(sort, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    discoverCollections("recent", 1, 0),
    discoverTags(),
    session ? ownListedCount(session.user.id) : 0,
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-10 pb-16 sm:pt-16">
          <DiscoverHeader tab="pages" pages={total} collections={collections.total} ownListed={ownListed} tags={tags} />
          <section aria-label="Pages" className="flex flex-col gap-3">
            <DiscoverToolbar tab="pages" sort={sort} total={total} feedHref={DISCOVER_FEED_PATH} />
            {total === 0 ? (
              <Empty className="border bg-card">
                <EmptyHeader>
                  <EmptyTitle>No pages yet</EmptyTitle>
                  <EmptyDescription>Check back later.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <DiscoverList rows={rows} sort={sort} page={Math.min(page, pageCount)} pageCount={pageCount} />
            )}
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
