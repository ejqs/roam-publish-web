import { ChevronUp } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { DiscoverRow } from "@/lib/discover";
import { plainText } from "@/lib/slug";
import { CountHelp } from "./count-help";
import { type DiscoverSort, listHref, PAGE_SIZE } from "./sort";

const SORT_LABELS: [DiscoverSort, string][] = [
  ["recent", "Recent"],
  ["trending", "Trending"],
  ["top", "Top"],
];

const MAX_TAGS = 3;

// UTC keeps the date the same wherever the page was cached.
const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

/** "5m ago" for the last month, then the date. Rendered on the server, so it can lag by the cache time. */
function ago(iso: string, now: number) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 30 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return dateFmt.format(new Date(iso));
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** Sort tabs for Discover, with what Trending and Top count. */
export function DiscoverSortTabs({ sort }: { sort: DiscoverSort }) {
  const segment = (on: boolean) =>
    cn(buttonVariants({ variant: "ghost", size: "sm" }), "rounded-none first:rounded-l-sm last:rounded-r-sm", on && "bg-muted font-medium");
  return (
    <div className="flex items-center gap-1">
      <nav
        aria-label="Sort"
        className="inline-flex rounded-sm shadow-[inset_0_0_0_1px_rgba(17,20,24,0.2),0_1px_2px_rgba(17,20,24,0.1)]"
      >
        {SORT_LABELS.map(([value, label]) => (
          <Link key={value} href={listHref(value, 1)} aria-current={value === sort ? "true" : undefined} className={segment(value === sort)}>
            {label}
          </Link>
        ))}
      </nav>
      <CountHelp label="How pages are ranked">
        <p>
          <span className="font-medium">Trending</span> ranks views from the last 7 days.{" "}
          <span className="font-medium">Top</span> ranks all-time upvotes.
        </p>
        <p className="mt-2 text-muted-foreground">
          Only signed-in users with a verified graph count. Each reader counts once per page, and upvotes from the page
          itself.
        </p>
      </CountHelp>
    </div>
  );
}

/** Discover as a ranked list, like a link aggregator: rank, score, title, then where it's from and when. */
export function DiscoverList({
  rows,
  sort,
  page,
  pageCount,
}: {
  rows: DiscoverRow[];
  sort: DiscoverSort;
  page: number;
  pageCount: number;
}) {
  // eslint-disable-next-line react-hooks/purity -- server component; "ago" is fixed at render time.
  const now = Date.now();
  const offset = (page - 1) * PAGE_SIZE;
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col divide-y border-y">
        {rows.map((r, i) => (
          <li key={r.href} className="flex items-start gap-2 py-3 sm:gap-3">
            <span className="w-6 shrink-0 pt-2 text-right text-sm text-muted-foreground tabular-nums sm:w-8">
              {offset + i + 1}
            </span>
            <Link
              href={r.href}
              title="Open the page to upvote it"
              className={cn(
                "flex w-11 shrink-0 flex-col items-center rounded-sm py-1 text-xs tabular-nums shadow-[inset_0_0_0_1px_var(--border)] hover:bg-muted",
                r.votes > 0 ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <ChevronUp className="size-4" aria-hidden />
              <span className="font-medium">{r.votes.toLocaleString("en-US")}</span>
              <span className="sr-only">{r.votes === 1 ? "upvote" : "upvotes"}</span>
            </Link>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Link
                href={r.href}
                className="text-[15px] leading-snug font-medium break-words text-foreground hover:underline visited:text-muted-foreground"
              >
                {plainText(r.title) || "Untitled"}
                {r.kind === "block" && (
                  <Badge variant="secondary" className="ml-1.5 h-[18px] px-1.5 align-[1px]">
                    Block
                  </Badge>
                )}
              </Link>
              <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                <span>
                  from{" "}
                  <Link href={r.source.href} className="text-link hover:underline">
                    {r.source.label}
                  </Link>
                </span>
                <span aria-hidden>·</span>
                <time dateTime={r.createdAt} title={dateFmt.format(new Date(r.createdAt))}>
                  {ago(r.createdAt, now)}
                </time>
                {r.views > 0 && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{plural(r.views, "view", "views")} this week</span>
                  </>
                )}
              </p>
              {r.tags.length > 0 && (
                <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
                  {r.tags.slice(0, MAX_TAGS).map((t) => (
                    <Link key={t} href={`/search?tag=${encodeURIComponent(t)}`} className="text-roam-ref hover:underline">
                      #{t}
                    </Link>
                  ))}
                  {r.tags.length > MAX_TAGS && <span className="text-muted-foreground">+{r.tags.length - MAX_TAGS}</span>}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {pageCount > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
          <PageLink href={listHref(sort, page - 1)} disabled={page <= 1} rel="prev">
            ← Previous
          </PageLink>
          <span className="text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <PageLink href={listHref(sort, page + 1)} disabled={page >= pageCount} rel="next">
            More →
          </PageLink>
        </nav>
      )}
    </div>
  );
}

function PageLink({ href, disabled, rel, children }: { href: string; disabled: boolean; rel: string; children: React.ReactNode }) {
  const className = buttonVariants({ variant: "outline", size: "sm" });
  if (disabled)
    return (
      <span className={`${className} pointer-events-none opacity-50`} aria-disabled="true">
        {children}
      </span>
    );
  return (
    <Link href={href} rel={rel} className={className}>
      {children}
    </Link>
  );
}
