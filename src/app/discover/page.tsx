import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { chipClass } from "@/components/page-list";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { headers } from "next/headers";
import Link from "next/link";
import { LibraryBigIcon, SearchIcon } from "lucide-react";
import { cn } from "cn";
import { auth } from "@/lib/auth";
import {
  discoverCollections,
  type DiscoverCollection,
  discoverPublications,
  discoverTags,
  ownListedCount,
} from "@/lib/discover";
import { DISCOVER_FEED_PATH } from "@/lib/feeds";
import { collectionPath } from "@/lib/publications";
import { DiscoverList, DiscoverToolbar } from "./discover-list";
import { PAGE_SIZE, parsePage, parseSort } from "@/lib/discover-sort";

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
    page === 1 ? discoverCollections() : [],
    discoverTags(),
    session ? ownListedCount(session.user.id) : 0,
  ]);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const counts = [
    plural(total, "page", "pages"),
    collections.length > 0 && plural(collections.length, "collection", "collections"),
  ].filter(Boolean);

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 pt-10 pb-16 sm:pt-16">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-[30px] leading-tight font-semibold sm:text-[38px]">Discover</h1>
              <p className="mt-1 text-base text-muted-foreground sm:text-lg">
                Pages from Roam graphs and collections whose owners opted in.
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {counts.join(" · ")}
                {ownListed > 0 && (
                  <>
                    {" · "}
                    <Link href="/dashboard" className="text-link hover:underline">
                      {ownListed === 1 ? "1 of them is yours" : `${ownListed.toLocaleString("en-US")} of them are yours`}
                    </Link>
                  </>
                )}
              </p>
            </div>
            <div className="flex max-w-2xl flex-col gap-3">
              <form action="/search" role="search" className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  name="q"
                  placeholder="Search published pages"
                  aria-label="Search published pages"
                  className="h-10 pl-9 text-[15px] md:text-[15px]"
                />
              </form>
              {tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Popular tags">
                  {tags.map((t) => (
                    <Link key={t} href={`/search?tag=${encodeURIComponent(t)}`} className={cn(chipClass(), "h-7 px-2.5")}>
                      #{t}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {total === 0 && collections.length === 0 ? (
            <Empty className="border bg-card">
              <EmptyHeader>
                <EmptyTitle>Nothing here yet</EmptyTitle>
                <EmptyDescription>Check back later.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-8">
              {collections.length > 0 && (
                <section aria-labelledby="discover-collections" className="flex flex-col gap-3">
                  <h2 id="discover-collections" className="text-sm font-semibold text-foreground/80">
                    Collections
                  </h2>
                  {/* Phones scroll them sideways, so the pages start near the top. */}
                  <ul className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3">
                    {collections.map((c) => (
                      <li key={c.slug} className="w-64 shrink-0 snap-start sm:w-auto">
                        <CollectionTile c={c} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <section aria-label="Pages" className="flex flex-col gap-3">
                <DiscoverToolbar sort={sort} total={total} feedHref={DISCOVER_FEED_PATH} />
                {total === 0 ? (
                  <p className="text-sm text-muted-foreground">No pages yet.</p>
                ) : (
                  <DiscoverList rows={rows} sort={sort} page={Math.min(page, pageCount)} pageCount={pageCount} />
                )}
              </section>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** A collection on Discover, drawn like a folder tile on a front page. */
function CollectionTile({ c }: { c: DiscoverCollection }) {
  return (
    <Link
      href={collectionPath(c.slug)}
      className="group flex h-full flex-col gap-3 rounded-sm bg-card p-4 shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_0_0_rgba(17,20,24,0),0_1px_1px_rgba(17,20,24,0.2)] transition-shadow hover:shadow-[0_0_0_1px_rgba(17,20,24,0.1),0_1px_1px_rgba(17,20,24,0.2),0_2px_6px_rgba(17,20,24,0.2)]"
    >
      <span className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
          <LibraryBigIcon className="size-[18px]" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold group-hover:underline">{c.name}</span>
          <span className="text-xs text-muted-foreground">{plural(c.pages, "page", "pages")}</span>
        </span>
      </span>
      {c.description && <span className="line-clamp-2 border-t pt-2.5 text-[13px] text-muted-foreground">{c.description}</span>}
    </Link>
  );
}
