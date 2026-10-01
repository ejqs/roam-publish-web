import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { discoverPublications } from "@/lib/discover";
import { DiscoverTable } from "./discover-table";
import { PAGE_SIZE, parsePage, parseSort } from "./sort";

export const metadata: Metadata = {
  title: "Discover · Roam Publish",
  description: "Recently published and trending pages from Roam graphs whose owners opted in.",
};

export default async function DiscoverPage(props: PageProps<"/discover">) {
  const search = await props.searchParams;
  const sort = parseSort(search.sort);
  const page = parsePage(search.page);
  const { total, rows } = await discoverPublications(sort, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-12">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">Discover</h1>
            <p className="text-sm text-muted-foreground">Pages from graphs whose owners opted in.</p>
          </div>
          {total === 0 ? (
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
