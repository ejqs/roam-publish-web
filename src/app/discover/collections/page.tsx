import { LibraryBigIcon } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { auth } from "@/lib/auth";
import { type DiscoverCollection, discoverCollections, discoverPublications, discoverTags, ownListedCount } from "@/lib/discover";
import { type DiscoverSort, parsePage, parseSort } from "@/lib/discover-sort";
import { collectionPath } from "@/lib/publications";
import { plainText } from "@/lib/slug";
import { DiscoverHeader } from "../discover-header";
import { DiscoverPagination, DiscoverToolbar } from "../discover-list";

export const metadata: Metadata = {
  title: "Collections · Discover · Roam Publish",
  description: "Collections of Roam pages whose owners listed them on Discover.",
};

const COLLECTIONS_PER_PAGE = 24;

// UTC keeps the date the same wherever the page was cached.
const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

export default async function DiscoverCollectionsPage(props: PageProps<"/discover/collections">) {
  const search = await props.searchParams;
  const sort = parseSort(search.sort);
  const page = parsePage(search.page);
  const session = await auth.api.getSession({ headers: await headers() });
  const [{ total, rows }, pages, tags, ownListed] = await Promise.all([
    discoverCollections(sort, COLLECTIONS_PER_PAGE, (page - 1) * COLLECTIONS_PER_PAGE),
    discoverPublications("recent", 1, 0),
    discoverTags(),
    session ? ownListedCount(session.user.id) : 0,
  ]);
  const pageCount = Math.max(1, Math.ceil(total / COLLECTIONS_PER_PAGE));

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pt-10 pb-16 sm:pt-16">
          <DiscoverHeader tab="collections" pages={pages.total} collections={total} ownListed={ownListed} tags={tags} />
          <section aria-label="Collections" className="flex flex-col gap-3">
            <DiscoverToolbar tab="collections" sort={sort} total={total} />
            {total === 0 ? (
              <Empty className="border bg-card">
                <EmptyHeader>
                  <EmptyTitle>No collections yet</EmptyTitle>
                  <EmptyDescription>Owners list a collection here from its settings.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                  {rows.map((c) => (
                    <li key={c.slug}>
                      <CollectionTile c={c} sort={sort} />
                    </li>
                  ))}
                </ul>
                <DiscoverPagination tab="collections" sort={sort} page={Math.min(page, pageCount)} pageCount={pageCount} />
              </>
            )}
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

/** A collection, drawn like a folder tile on a front page: its newest pages, then what it's ranked by. */
function CollectionTile({ c, sort }: { c: DiscoverCollection; sort: DiscoverSort }) {
  const stat =
    sort === "trending"
      ? plural(c.views, "view", "views") + " this week"
      : sort === "top"
        ? plural(c.votes, "upvote", "upvotes")
        : `Updated ${dateFmt.format(new Date(c.updatedAt))}`;
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
      {c.description && <span className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">{c.description}</span>}
      {c.titles.length > 0 && (
        <span className="flex flex-col gap-1 border-t pt-2.5">
          {c.titles.map((t, i) => (
            <span key={i} className="truncate text-[13px] text-foreground/80">
              {plainText(t) || "Untitled"}
            </span>
          ))}
        </span>
      )}
      <span className="mt-auto pt-1 text-xs text-muted-foreground">{stat}</span>
    </Link>
  );
}
