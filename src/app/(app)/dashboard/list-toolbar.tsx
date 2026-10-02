import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KINDS, type KindFilter, type ListConfig, listHref, type ListState, PAGE_SIZE, sortHref } from "./filters";

const KIND_LABELS: Record<KindFilter, string> = { page: "Pages", block: "Blocks" };

/**
 * Search, filters and sort for a dashboard page list. Everything lives in the URL, so it works
 * without JavaScript. `hidden` filters only show while they match something or are selected.
 */
export function ListToolbar<F extends string, S extends string>({
  cfg,
  path,
  state,
  counts,
  hidden = [],
}: {
  cfg: ListConfig<F, S>;
  path: string;
  state: ListState<F, S>;
  counts: Record<F | "all", number>;
  hidden?: F[];
}) {
  const chip = (active: boolean) =>
    buttonVariants({ variant: active ? "secondary" : "ghost", size: "sm", className: "gap-1.5" });
  const filterOptions: (F | null)[] = [
    null,
    ...cfg.filters.filter((a) => !hidden.includes(a) || counts[a] > 0 || state.access === a),
  ];

  return (
    <div className="flex flex-col gap-3">
      <form action={path} className="flex gap-2" role="search">
        {/* Searching keeps the other filters and the sort. */}
        {[...new URL(listHref(cfg, path, state, { q: "" }), "http://x").searchParams].map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <Input
          type="search"
          name="q"
          defaultValue={state.q}
          placeholder="Search titles"
          aria-label="Search titles"
          className="h-8"
        />
        <Button type="submit" variant="outline" size="sm">
          <SearchIcon />
          Search
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-1 text-sm" role="group" aria-label="Filter by listing">
        {filterOptions.map((a) => (
          <Link
            key={a ?? "all"}
            href={listHref(cfg, path, state, { access: a })}
            aria-current={state.access === a ? "true" : undefined}
            className={chip(state.access === a)}
          >
            {a ? cfg.filterLabels[a] : "All"}
            <span className="text-muted-foreground tabular-nums">{counts[a ?? "all"].toLocaleString("en-US")}</span>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by type">
          {([null, ...KINDS] as const).map((k) => (
            <Link
              key={k ?? "any"}
              href={listHref(cfg, path, state, { kind: k })}
              aria-current={state.kind === k ? "true" : undefined}
              className={chip(state.kind === k)}
            >
              {k ? KIND_LABELS[k] : "Any type"}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
          <span className="mr-1">Sort</span>
          {cfg.sorts.map((s) => (
            <Link
              key={s}
              href={sortHref(cfg, path, state, s)}
              aria-current={state.sort === s ? "true" : undefined}
              className={chip(state.sort === s)}
            >
              {cfg.sortLabels[s]}
              {state.sort === s && (
                <span aria-label={state.desc ? "descending" : "ascending"}>
                  {s === "title" ? (state.desc ? "Z–A" : "A–Z") : state.desc ? "↓" : "↑"}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
      {state.q && (
        <p className="text-xs text-muted-foreground">
          Titles containing “{state.q}” ·{" "}
          <Link href={listHref(cfg, path, state, { q: "" })} className="text-link hover:underline">
            Clear search
          </Link>
        </p>
      )}
    </div>
  );
}

/** "No pages match" with a way out of the filters, or the list's own empty message. */
export function ListEmpty({ filtered, path, children }: { filtered: boolean; path: string; children: React.ReactNode }) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">
      {filtered ? (
        <>
          No pages match.{" "}
          <Link href={path} className="text-link hover:underline">
            Clear filters
          </Link>
        </>
      ) : (
        children
      )}
    </p>
  );
}

export function ListPagination<F extends string, S extends string>({
  cfg,
  path,
  state,
  page,
  matching,
}: {
  cfg: ListConfig<F, S>;
  path: string;
  state: ListState<F, S>;
  page: number;
  matching: number;
}) {
  if (matching === 0) return null;
  const pageCount = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  return (
    <nav className="flex flex-wrap items-center justify-between gap-2 text-sm" aria-label="Pagination">
      <PageLink href={listHref(cfg, path, state, { page: page - 1 })} disabled={page <= 1} rel="prev">
        ← Previous
      </PageLink>
      <span className="text-muted-foreground">
        {((page - 1) * PAGE_SIZE + 1).toLocaleString("en-US")}–
        {Math.min(page * PAGE_SIZE, matching).toLocaleString("en-US")} of {matching.toLocaleString("en-US")}
      </span>
      <PageLink href={listHref(cfg, path, state, { page: page + 1 })} disabled={page >= pageCount} rel="next">
        Next →
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  disabled,
  rel,
  children,
}: {
  href: string;
  disabled: boolean;
  rel: string;
  children: React.ReactNode;
}) {
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
