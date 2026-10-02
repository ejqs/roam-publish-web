import { ArrowUpDownIcon, SearchIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";
import { LockHint } from "@/components/access-lock";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  isFiltered,
  KINDS,
  LIST_PAGE_SIZE,
  type ListConfig,
  listHref,
  type ListState,
  toggleTag,
} from "@/lib/list-params";
import type { TagCount } from "@/lib/list-query";
import { plainText } from "@/lib/slug";

/** Search, tag, type and sort controls for a public graph or collection list. All links and a GET form. */

const KIND_LABELS = { page: "Pages", block: "Blocks" } as const;

const segment = (on: boolean) =>
  cn(
    buttonVariants({ variant: "ghost", size: "sm" }),
    "rounded-none first:rounded-l-sm last:rounded-r-sm",
    on && "bg-muted font-medium",
  );

export const chipClass = (on = false) =>
  cn(
    "inline-flex h-6 items-center gap-1.5 rounded-4xl border px-2 text-xs text-roam-ref transition-all hover:bg-muted",
    on && "border-roam-ref bg-roam-ref/10",
  );

export function ListToolbar<S extends string>({
  cfg,
  path,
  state,
  tags,
  placeholder,
  tagIndex,
}: {
  cfg: ListConfig<S>;
  path: string;
  state: ListState<S>;
  /** Most used tags among the current results. */
  tags: TagCount[];
  placeholder: string;
  /** Link to every tag, when there's a page for that. */
  tagIndex?: string;
}) {
  const href = (change: Partial<ListState<S>>) => listHref(cfg, path, state, change);
  // Chosen tags stay visible even when the counts no longer list them.
  const shown: TagCount[] = [
    ...state.tags.filter((t) => !tags.some((c) => c.tag === t)).map((tag) => ({ tag, n: 0 })),
    ...tags,
  ];
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <form action={path} role="search" className="relative min-w-48 flex-1">
          {/* Searching keeps the tags and type. */}
          {state.tags.map((t) => (
            <input key={t} type="hidden" name="tag" value={t} />
          ))}
          {state.kind && <input type="hidden" name="kind" value={state.kind} />}
          <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
          <Input type="search" name="q" defaultValue={state.q} placeholder={placeholder} aria-label={placeholder} className="pl-8" />
        </form>
        <div className="inline-flex rounded-sm shadow-[inset_0_0_0_1px_rgba(17,20,24,0.2),0_1px_2px_rgba(17,20,24,0.1)]" role="group" aria-label="Type">
          {([null, ...KINDS] as const).map((k) => (
            <Link key={k ?? "all"} href={href({ kind: k })} aria-current={state.kind === k ? "true" : undefined} className={segment(state.kind === k)}>
              {k ? KIND_LABELS[k] : "All"}
            </Link>
          ))}
        </div>
      </div>
      {shown.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by tag">
          <span className="mr-0.5 text-xs font-medium text-muted-foreground">Tags</span>
          {shown.map(({ tag, n }) => {
            const on = state.tags.includes(tag);
            return (
              <Link
                key={tag}
                href={href({ tags: toggleTag(state.tags, tag) })}
                aria-current={on ? "true" : undefined}
                className={chipClass(on)}
              >
                #{tag}
                {n > 0 && <span className="text-muted-foreground tabular-nums">{n}</span>}
              </Link>
            );
          })}
          {tagIndex && (
            <Link href={tagIndex} className="ml-1 text-xs text-link hover:underline">
              All tags
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

/** The line above the list: how many match, what's filtering them, and the sort. */
export function ListStatus<S extends string>({
  cfg,
  path,
  state,
  matching,
  total,
}: {
  cfg: ListConfig<S>;
  path: string;
  state: ListState<S>;
  matching: number;
  total: number;
}) {
  const href = (change: Partial<ListState<S>>) => listHref(cfg, path, state, change);
  const filtered = isFiltered(state);
  const sorts: (S | "relevance")[] = state.q ? [...cfg.sorts, "relevance"] : [...cfg.sorts];
  const remove = (label: string, aria: string, to: string) => (
    <Badge key={aria} variant="secondary" className="h-[22px] gap-1 bg-muted pr-1">
      {label}
      <Link href={to} aria-label={aria} className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground">
        <XIcon className="size-3!" />
      </Link>
    </Badge>
  );
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t py-2 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-muted-foreground">
          {filtered ? `${matching.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}` : total.toLocaleString("en-US")}{" "}
          {total === 1 ? "page" : "pages"}
        </span>
        {state.q && remove(`“${state.q}”`, "Remove search", href({ q: "" }))}
        {state.tags.map((t) => remove(`#${t}`, `Remove tag ${t}`, href({ tags: toggleTag(state.tags, t) })))}
        {state.kind && remove(state.kind === "page" ? "Pages only" : "Blocks only", "Remove type filter", href({ kind: null }))}
        {filtered && (
          <Link href={path} className="px-1 text-xs text-link hover:underline">
            Clear all
          </Link>
        )}
      </div>
      {total > 1 && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowUpDownIcon className="size-3.5" />
            Sort
          </span>
          <div className="inline-flex flex-wrap rounded-sm shadow-[inset_0_0_0_1px_rgba(17,20,24,0.2),0_1px_2px_rgba(17,20,24,0.1)]" role="group" aria-label="Sort">
            {sorts.map((s) => (
              <Link key={s} href={href({ sort: s })} aria-current={state.sort === s ? "true" : undefined} className={segment(state.sort === s)}>
                {cfg.sortLabels[s]}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export type ListRow = {
  href: string;
  title: string;
  kind: "page" | "block";
  /** Why it needs a password or membership to read, when it does. */
  lock?: string;
  author?: string;
  tags: string[];
  /** Text around the search hit, when the hit isn't in the title. */
  snippet?: { text: string; hit: boolean }[];
  dates: string[];
};

// UTC keeps renders identical everywhere.
const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
export const formatDate = (d: Date) => dateFmt.format(d);

export function PageList<S extends string>({
  cfg,
  path,
  state,
  rows,
  matching,
  dateLabels,
}: {
  cfg: ListConfig<S>;
  path: string;
  state: ListState<S>;
  rows: ListRow[];
  matching: number;
  dateLabels: string[];
}) {
  if (!rows.length)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No pages match</EmptyTitle>
          <EmptyDescription>Try fewer tags or a shorter search.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link href={path} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Clear filters
          </Link>
        </EmptyContent>
      </Empty>
    );
  const pageCount = Math.max(1, Math.ceil(matching / LIST_PAGE_SIZE));
  const page = Math.min(state.page, pageCount);
  // Phones keep the first date only.
  const cols = "grid grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-x-4 px-2 sm:grid-cols-[minmax(0,1fr)_repeat(2,7rem)]";
  return (
    <div className="flex flex-col gap-4">
      <div role="table" aria-label="Published pages" className="text-sm">
        <div role="row" className={cn(cols, "h-10 border-y font-medium")}>
          <span role="columnheader">Title</span>
          {dateLabels.map((l, i) => (
            <span key={l} role="columnheader" className={i > 0 ? "hidden sm:block" : undefined}>
              {l}
            </span>
          ))}
        </div>
        {rows.map((r) => (
          <div key={r.href} role="row" className={cn(cols, "border-b py-2.5 hover:bg-muted/50")}>
            <div role="cell" className="flex min-w-0 flex-col gap-1">
              <span className="flex min-w-0 items-center gap-1.5">
                {r.lock && <LockHint text={r.lock} />}
                <Link href={r.href} className="min-w-0 break-words text-link hover:underline max-sm:line-clamp-2 sm:truncate">
                  {plainText(r.title) || "Untitled"}
                </Link>
                {r.kind === "block" && (
                  <Badge variant="secondary" className="h-[18px] px-1.5">
                    Block
                  </Badge>
                )}
              </span>
              {r.snippet && (
                <span className="truncate text-xs text-muted-foreground">
                  {r.snippet.map((p, i) =>
                    p.hit ? (
                      <mark key={i} className="bg-roam-highlight px-0.5 text-inherit">
                        {p.text}
                      </mark>
                    ) : (
                      p.text
                    ),
                  )}
                </span>
              )}
              {r.author && <span className="text-xs text-muted-foreground">By {r.author}</span>}
              {r.tags.length > 0 && (
                <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                  {r.tags.slice(0, 6).map((t) => (
                    <Link
                      key={t}
                      href={listHref(cfg, path, state, { tags: state.tags.includes(t) ? state.tags : toggleTag(state.tags, t) })}
                      className="text-xs text-roam-ref hover:underline"
                    >
                      #{t}
                    </Link>
                  ))}
                </span>
              )}
            </div>
            {r.dates.map((d, i) => (
              <span key={i} role="cell" className={cn("text-muted-foreground", i > 0 && "hidden sm:block")}>
                {d}
              </span>
            ))}
          </div>
        ))}
      </div>
      {pageCount > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
          <PageLink href={listHref(cfg, path, state, { page: page - 1 })} disabled={page <= 1} rel="prev">
            ← Previous
          </PageLink>
          <span className="text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <PageLink href={listHref(cfg, path, state, { page: page + 1 })} disabled={page >= pageCount} rel="next">
            Next →
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
