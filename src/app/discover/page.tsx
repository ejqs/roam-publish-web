import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import Link from "next/link";
import { FeedLink } from "@/components/feed-link";
import { discoverCollections, type DiscoverCollection, discoverPublications } from "@/lib/discover";
import { DISCOVER_FEED_PATH } from "@/lib/feeds";
import { collectionPath } from "@/lib/publications";
import { DiscoverList, DiscoverSortTabs } from "./discover-list";
import { PAGE_SIZE, parsePage, parseSort } from "./sort";

export const metadata: Metadata = {
  title: "Discover · Roam Publish",
  description: "Recently published and trending pages from Roam graphs whose owners opted in.",
  alternates: { types: { "application/rss+xml": DISCOVER_FEED_PATH } },
};

export default async function DiscoverPage(props: PageProps<"/discover">) {
  const search = await props.searchParams;
  const sort = parseSort(search.sort);
  const page = parsePage(search.page);
  const [{ total, rows }, collections] = await Promise.all([
    discoverPublications(sort, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    page === 1 ? discoverCollections() : [],
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 sm:py-12">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold">Discover</h1>
              <p className="text-sm text-muted-foreground">Pages from graphs and collections whose owners opted in.</p>
            </div>
            <FeedLink href={DISCOVER_FEED_PATH} />
          </div>
          {total === 0 && collections.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>Nothing here yet</EmptyTitle>
                <EmptyDescription>Check back later.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-10">
              <div className="flex min-w-0 flex-col gap-3">
                <DiscoverSortTabs sort={sort} />
                {/* Phones: collections as a strip above the feed, so the ranking starts near the top. */}
                {collections.length > 0 && (
                  <section aria-label="Collections" className="-mx-4 lg:hidden">
                    <ul className="flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1">
                      {collections.map((c) => (
                        <li key={c.slug} className="w-56 shrink-0 snap-start">
                          <CollectionCard c={c} />
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {total === 0 ? (
                  <p className="py-6 text-sm text-muted-foreground">No pages yet.</p>
                ) : (
                  <DiscoverList rows={rows} sort={sort} page={Math.min(page, pageCount)} pageCount={pageCount} />
                )}
              </div>
              {collections.length > 0 && (
                <aside aria-label="Collections" className="hidden flex-col gap-2 lg:flex">
                  <h2 className="text-sm font-semibold">Collections</h2>
                  <ul className="flex flex-col gap-2">
                    {collections.map((c) => (
                      <li key={c.slug}>
                        <CollectionCard c={c} />
                      </li>
                    ))}
                  </ul>
                </aside>
              )}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function CollectionCard({ c }: { c: DiscoverCollection }) {
  return (
    <Link href={collectionPath(c.slug)} className="flex h-full flex-col gap-0.5 rounded-sm border bg-card p-3 hover:bg-muted/50">
      <span className="line-clamp-1 font-medium text-link">{c.name}</span>
      {c.description && <span className="line-clamp-2 text-sm text-muted-foreground">{c.description}</span>}
      <span className="mt-auto text-xs text-muted-foreground">
        {c.pages} {c.pages === 1 ? "page" : "pages"}
      </span>
    </Link>
  );
}
