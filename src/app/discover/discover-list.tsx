import { Dot, RssIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { ListUpvote, ListVotesHint, ListVotesProvider } from "@/components/upvote-button";
import type { DiscoverRow } from "@/lib/discover";
import { plainText } from "@/lib/slug";
import { type DiscoverSort, listHref, PAGE_SIZE } from "@/lib/discover-sort";

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

const SORT_CAPTIONS: Record<DiscoverSort, string> = {
  recent: "Newest first",
  trending: "Most read in the last 7 days",
  top: "Most upvoted of all time",
};

const RANKING_NOTES: Record<DiscoverSort, string | null> = {
  recent: null,
  trending: "Ranks views from the last 7 days.",
  top: "Ranks all-time upvotes.",
};

/** The page count, sort, what the sort ranks by, and the feed, above the list. */
export function DiscoverToolbar({ sort, total, feedHref }: { sort: DiscoverSort; total: number; feedHref: string }) {
  const segment = (on: boolean) =>
    cn(
      buttonVariants({ variant: "ghost", size: "sm" }),
      "rounded-none first:rounded-l-sm last:rounded-r-sm max-sm:h-10 max-sm:flex-1",
      on && "bg-muted font-medium",
    );
  const note = RANKING_NOTES[sort];
  return (
    <div className="flex flex-col gap-1 border-t pt-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
        <span className="text-muted-foreground">
          {plural(total, "page", "pages")} · {SORT_CAPTIONS[sort]}
        </span>
        <div className="flex items-center gap-2 max-sm:w-full">
          <nav
            aria-label="Sort"
            className="inline-flex rounded-sm shadow-[inset_0_0_0_1px_rgba(17,20,24,0.2),0_1px_2px_rgba(17,20,24,0.1)] max-sm:flex-1"
          >
            {SORT_LABELS.map(([value, label]) => (
              <Link key={value} href={listHref(value, 1)} aria-current={value === sort ? "true" : undefined} className={segment(value === sort)}>
                {label}
              </Link>
            ))}
          </nav>
          <a
            href={feedHref}
            title="RSS feed"
            className={buttonVariants({ variant: "ghost", size: "sm", className: "text-xs text-muted-foreground max-sm:size-10" })}
          >
            <RssIcon className="size-3.5" />
            <span className="max-sm:sr-only">RSS</span>
          </a>
        </div>
      </div>
      {note && (
        <p className="text-xs text-muted-foreground">
          {note} Only signed-in readers with a verified graph count, once per page, and never on their own pages.
        </p>
      )}
    </div>
  );
}

/**
 * Discover as a list: title, the start of the page, then where it's from, when, and its tags. Ranked
 * sorts add the rank; Trending adds the views it ranks by.
 */
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
  const ranked = sort !== "recent";
  return (
    <ListVotesProvider ids={rows.map((r) => r.id)}>
      <div className="flex flex-col gap-3">
        <ListVotesHint />
        <ol className="flex flex-col divide-y rounded-sm bg-card shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_0_0_rgba(17,20,24,0),0_1px_1px_rgba(17,20,24,0.2)]">
          {rows.map((r, i) => (
            <li key={r.href} className="flex items-start gap-3 p-4 sm:gap-4">
              {ranked && (
                <span className="w-5 shrink-0 pt-px text-right text-base font-semibold text-muted-foreground tabular-nums sm:w-6">
                  {offset + i + 1}
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Link
                    href={r.href}
                    className="text-base leading-snug font-semibold break-words text-foreground hover:underline visited:text-muted-foreground"
                  >
                    {plainText(r.title) || "Untitled"}
                  </Link>
                  {r.kind === "block" && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Dot className="size-3" strokeWidth={6} aria-hidden />
                      Block
                    </span>
                  )}
                </div>
                {r.excerpt && <p className="line-clamp-2 text-sm leading-5 break-words text-muted-foreground">{r.excerpt}</p>}
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <Link href={r.source.href} className="inline-flex items-center gap-1.5 font-medium text-foreground hover:underline">
                    <span
                      aria-hidden
                      className="flex size-4 items-center justify-center rounded-sm bg-muted text-[10px] font-semibold text-muted-foreground uppercase"
                    >
                      {r.source.label.slice(0, 1)}
                    </span>
                    {r.source.label}
                  </Link>
                  {sort === "trending" && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="font-medium text-foreground">{plural(r.views, "view", "views")} this week</span>
                    </>
                  )}
                  <span aria-hidden>·</span>
                  <time dateTime={r.createdAt} title={dateFmt.format(new Date(r.createdAt))}>
                    {ago(r.createdAt, now)}
                  </time>
                  {r.tags.slice(0, MAX_TAGS).map((t) => (
                    <Link key={t} href={`/search?tag=${encodeURIComponent(t)}`} className="text-roam-ref hover:underline">
                      #{t}
                    </Link>
                  ))}
                  {r.tags.length > MAX_TAGS && (
                    <Link href={r.href} className="hover:underline">
                      +{r.tags.length - MAX_TAGS} more
                    </Link>
                  )}
                </p>
              </div>
              <ListUpvote publicationId={r.id} initialCount={r.votes} />
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
    </ListVotesProvider>
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
