import { BanIcon, CompassIcon, FileTextIcon, type LucideIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { PRIVACY_ICONS } from "@/components/privacy-icons";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KINDS, type KindFilter, type ListConfig, listHref, type ListState, PAGE_SIZE, sortHref } from "./filters";
import { LinkMenu } from "./link-menu";

const KIND_LABELS: Record<KindFilter, string> = { page: "Pages", block: "Blocks" };

// The access menu's icons. Graphs call listed pages "public", collections "listed".
const FILTER_ICONS: Record<string, LucideIcon | undefined> = {
  unlisted: PRIVACY_ICONS.unlisted,
  public: FileTextIcon,
  listed: FileTextIcon,
  discover: CompassIcon,
  removed: BanIcon,
};

/**
 * Search, filters and sort for a dashboard page list. Everything lives in the URL; type and sort
 * sit in small link menus. `hidden` filters only show while they match something or are selected.
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
  const filterOptions: (F | null)[] = [
    null,
    ...cfg.filters.filter((a) => !hidden.includes(a) || counts[a] > 0 || state.access === a),
  ];
  const arrow = (s: S) => (s === "title" ? (state.desc ? "Z–A" : "A–Z") : state.desc ? "↓" : "↑");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <form action={path} className="relative min-w-0 flex-[1_1_16rem]" role="search">
          {/* Searching keeps the other filters and the sort. */}
          {[...new URL(listHref(cfg, path, state, { q: "" }), "http://x").searchParams].map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            defaultValue={state.q}
            placeholder="Filter by title"
            aria-label="Filter by title"
            className="pl-8"
          />
          <button type="submit" className="sr-only">
            Search
          </button>
        </form>
        <LinkMenu
          label="Type"
          value={state.kind ? KIND_LABELS[state.kind] : "Any"}
          items={([null, ...KINDS] as const).map((k) => ({
            href: listHref(cfg, path, state, { kind: k }),
            label: k ? KIND_LABELS[k] : "Any type",
            active: state.kind === k,
          }))}
        />
        <LinkMenu
          label="Sort"
          value={
            <>
              {cfg.sortLabels[state.sort]}
              <span aria-label={state.desc ? "descending" : "ascending"}>{arrow(state.sort)}</span>
            </>
          }
          items={cfg.sorts.map((s) => ({
            href: sortHref(cfg, path, state, s),
            label: (
              <span>
                {cfg.sortLabels[s]}
                {state.sort === s && <span className="ml-1 text-muted-foreground">{arrow(s)}</span>}
              </span>
            ),
            active: state.sort === s,
          }))}
        />
      </div>

      <div className="flex flex-wrap items-center gap-1 text-sm" role="group" aria-label="Filter by listing">
        {filterOptions.map((a) => {
          const Icon = a ? FILTER_ICONS[a] : undefined;
          const active = state.access === a;
          return (
            <Link
              key={a ?? "all"}
              href={listHref(cfg, path, state, { access: a })}
              aria-current={active ? "true" : undefined}
              className={buttonVariants({
                variant: "ghost",
                size: "sm",
                className: `gap-1.5 ${active ? "bg-muted font-medium text-foreground" : counts[a ?? "all"] === 0 ? "text-muted-foreground" : ""}`,
              })}
            >
              {Icon && <Icon />}
              {a ? cfg.filterLabels[a] : "All"}
              <span className="font-normal text-muted-foreground tabular-nums">
                {counts[a ?? "all"].toLocaleString("en-US")}
              </span>
            </Link>
          );
        })}
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
