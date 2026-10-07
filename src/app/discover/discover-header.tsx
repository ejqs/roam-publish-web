import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";
import { chipClass } from "@/components/page-list";
import { Input } from "@/components/ui/input";
import type { DiscoverTab } from "./discover-list";

/** The top of Discover: what it is, a search box, popular tags, and tabs for Pages and Collections. */
export function DiscoverHeader({
  tab,
  pages,
  collections,
  ownListed,
  tags,
}: {
  tab: DiscoverTab;
  pages: number;
  collections: number;
  ownListed: number;
  tags: string[];
}) {
  const tabs = [
    { key: "pages", href: "/discover", label: "Pages", n: pages },
    { key: "collections", href: "/discover/collections", label: "Collections", n: collections },
  ] as const;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[30px] leading-tight font-semibold sm:text-[38px]">Discover</h1>
          <p className="mt-1 text-base text-muted-foreground sm:text-lg">Pages from Roam graphs and collections whose owners opted in.</p>
          {ownListed > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              <Link href="/dashboard" className="text-link hover:underline">
                {ownListed === 1 ? "1 of your pages is" : `${ownListed.toLocaleString("en-US")} of your pages are`} here
              </Link>
            </p>
          )}
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
      <nav aria-label="Discover" className="flex gap-5 overflow-x-auto overflow-y-hidden border-b text-sm">
        {tabs.map((t) => {
          const on = t.key === tab;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "-mb-px flex shrink-0 items-center gap-1.5 border-b-2 py-2",
                on ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <span className="rounded-4xl bg-muted px-1.5 text-xs font-medium text-foreground tabular-nums">{t.n.toLocaleString("en-US")}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
