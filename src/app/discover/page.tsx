import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import Link from "next/link";
import { FeedLink } from "@/components/feed-link";
import { discoverCollections, discoverPublications } from "@/lib/discover";
import { DISCOVER_FEED_PATH } from "@/lib/feeds";
import { collectionPath } from "@/lib/publications";
import { DiscoverTable } from "./discover-table";
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
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-12">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold">Discover</h1>
              <p className="text-sm text-muted-foreground">Pages from graphs and collections whose owners opted in.</p>
            </div>
            <FeedLink href={DISCOVER_FEED_PATH} />
          </div>
          {collections.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="font-semibold">Collections</h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {collections.map((c) => (
                  <li key={c.slug} className="rounded-sm border p-3">
                    <Link href={collectionPath(c.slug)} className="font-medium text-link hover:underline">
                      {c.name}
                    </Link>
                    {c.description && <p className="line-clamp-2 text-sm text-muted-foreground">{c.description}</p>}
                    <p className="text-xs text-muted-foreground">
                      {c.pages} {c.pages === 1 ? "page" : "pages"}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {total === 0 && collections.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>Nothing here yet</EmptyTitle>
                <EmptyDescription>Check back later.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <DiscoverTable rows={rows} sort={sort} page={Math.min(page, pageCount)} pageCount={pageCount} />
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
