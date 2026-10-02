import { BookIcon, FolderIcon, SearchIcon, XIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "cn";
import { chipClass, formatDate } from "@/components/page-list";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { MAX_FILTER_TAGS, toggleTag } from "@/lib/list-params";
import { canSearchSite } from "@/lib/graph-access";
import { rateLimit } from "@/lib/rate-limit";
import { SEARCH_PAGE_SIZE, type SearchSort, searchPages, searchPlaces } from "@/lib/site-search";
import { plainText } from "@/lib/slug";
import { normalizeTag } from "@/lib/tags";
import { viewerId } from "@/lib/viewer";

export const metadata: Metadata = {
  title: "Search · Roam Publish",
  robots: { index: false, follow: true },
};

type State = { q: string; tags: string[]; sort: SearchSort; page: number };

function parse(search: Record<string, string | string[] | undefined>): State {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const all = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
  const q = (one(search.q) ?? "").trim().slice(0, 200);
  const tags = [...new Set(all(search.tag).map(normalizeTag).filter((t): t is string => !!t))].slice(0, MAX_FILTER_TAGS);
  const n = Number(one(search.page));
  return {
    q,
    tags,
    sort: one(search.sort) === "recent" || !q ? "recent" : "best",
    page: Number.isInteger(n) && n > 0 ? n : 1,
  };
}

function href(s: State, change: Partial<State> = {}) {
  const next = { ...s, page: 1, ...change };
  const p = new URLSearchParams();
  if (next.q) p.set("q", next.q);
  for (const t of next.tags) p.append("tag", t);
  if (next.sort === "recent" && next.q) p.set("sort", "recent");
  if (next.page > 1) p.set("page", String(next.page));
  const str = p.toString();
  return str ? `/search?${str}` : "/search";
}

const side = (on: boolean) => cn(buttonVariants({ variant: "ghost" }), "justify-start", on && "bg-accent font-medium");

export default async function SearchPage(props: PageProps<"/search">) {
  const s = parse(await props.searchParams);
  const me = await viewerId();
  const verified = await canSearchSite(me);
  const searching = !!s.q || s.tags.length > 0;
  const allowed = !searching || !verified || rateLimit(`search:user:${me}`, 60, 60 * 1000);
  const [pages, places] =
    searching && verified && allowed
      ? await Promise.all([searchPages(s), s.page === 1 ? searchPlaces(s.q) : []])
      : [null, []];
  const pageCount = pages ? Math.max(1, Math.ceil(pages.total / SEARCH_PAGE_SIZE)) : 1;

  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12">
          <form action="/search" role="search" className="relative">
            {s.tags.map((t) => (
              <input key={t} type="hidden" name="tag" value={t} />
            ))}
            <SearchIcon className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground" />
            <Input
              type="search"
              name="q"
              defaultValue={s.q}
              placeholder="Search published pages, graphs and collections"
              aria-label="Search Roam Publish"
              className="pl-8"
            />
          </form>

          {!verified ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>{me ? "Connect a Roam graph to search" : "Log in to search"}</EmptyTitle>
                <EmptyDescription>
                  Searching all of Roam Publish is for people with a verified email and a verified Roam graph. You can
                  still search inside any graph or collection from its page.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Link
                  href={me ? "/onboarding" : `/login?next=${encodeURIComponent(href(s))}`}
                  className={buttonVariants({ size: "sm" })}
                >
                  {me ? "Connect a graph" : "Log in"}
                </Link>
              </EmptyContent>
            </Empty>
          ) : !searching ? (
            <p className="text-sm text-muted-foreground">
              Search titles and text of pages listed on public graphs and collections. Add a #tag to narrow it down.
            </p>
          ) : !allowed ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyTitle>Too many searches</EmptyTitle>
                <EmptyDescription>Wait a minute and try again.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            pages && (
              <div className="grid gap-8 md:grid-cols-[200px_minmax(0,1fr)]">
                <aside aria-label="Refine" className="flex flex-col gap-6 text-sm">
                  {s.q && (
                    <div className="flex flex-col gap-1">
                      <span className="px-2 pb-1 text-xs font-medium text-muted-foreground">Sort</span>
                      <Link href={href(s, { sort: "best" })} aria-current={s.sort === "best" ? "true" : undefined} className={side(s.sort === "best")}>
                        Best match
                      </Link>
                      <Link href={href(s, { sort: "recent" })} aria-current={s.sort === "recent" ? "true" : undefined} className={side(s.sort === "recent")}>
                        Recently updated
                      </Link>
                    </div>
                  )}
                  {(pages.tags.length > 0 || s.tags.length > 0) && (
                    <div className="flex flex-col gap-2">
                      <span className="px-2 text-xs font-medium text-muted-foreground">Tags</span>
                      <div className="flex flex-wrap gap-1.5 px-2">
                        {[...s.tags.filter((t) => !pages.tags.some((c) => c.tag === t)).map((tag) => ({ tag, n: 0 })), ...pages.tags].map(
                          ({ tag, n }) => (
                            <Link
                              key={tag}
                              href={href(s, { tags: toggleTag(s.tags, tag) })}
                              aria-current={s.tags.includes(tag) ? "true" : undefined}
                              className={chipClass(s.tags.includes(tag))}
                            >
                              #{tag}
                              {n > 0 && <span className="text-muted-foreground tabular-nums">{n}</span>}
                            </Link>
                          ),
                        )}
                      </div>
                    </div>
                  )}
                </aside>

                <div className="flex min-w-0 flex-col gap-5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h1 className="mr-1 text-2xl font-semibold">{s.q ? `Results for “${s.q}”` : "Tagged pages"}</h1>
                    {s.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="h-[22px] gap-1 bg-muted pr-1">
                        #{t}
                        <Link
                          href={href(s, { tags: toggleTag(s.tags, t) })}
                          aria-label={`Remove tag ${t}`}
                          className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <XIcon className="size-3!" />
                        </Link>
                      </Badge>
                    ))}
                  </div>
                  <p className="-mt-3 text-sm text-muted-foreground">
                    {pages.total.toLocaleString("en-US")} {pages.total === 1 ? "page" : "pages"} from public graphs and collections
                  </p>

                  {places.length > 0 && (
                    <ul className="grid gap-3 sm:grid-cols-2">
                      {places.map((p) => (
                        <li key={p.href} className="rounded-sm bg-card p-3 shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_0_0_rgba(17,20,24,0),0_1px_1px_rgba(17,20,24,0.2)]">
                          <Link href={p.href} className="flex items-center gap-1.5 font-semibold text-link hover:underline">
                            {p.kind === "graph" ? <BookIcon className="size-4 text-muted-foreground" /> : <FolderIcon className="size-4 text-muted-foreground" />}
                            {p.name}
                          </Link>
                          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                            {p.kind === "graph" ? "Graph" : "Collection"} · {p.pages} {p.pages === 1 ? "page" : "pages"}
                            {p.description && ` · ${p.description}`}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}

                  {pages.rows.length === 0 ? (
                    <Empty className="border">
                      <EmptyHeader>
                        <EmptyTitle>No pages match</EmptyTitle>
                        <EmptyDescription>Try fewer tags or different words.</EmptyDescription>
                      </EmptyHeader>
                      {s.tags.length > 0 && (
                        <EmptyContent>
                          <Link href={href(s, { tags: [] })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                            Clear tags
                          </Link>
                        </EmptyContent>
                      )}
                    </Empty>
                  ) : (
                    <ul className="flex flex-col rounded-sm bg-card shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_0_0_rgba(17,20,24,0),0_1px_1px_rgba(17,20,24,0.2)]">
                      {pages.rows.map((r) => (
                        <li key={r.href} className="flex flex-col gap-1 border-b px-5 py-4 last:border-b-0">
                          <span className="text-xs text-muted-foreground">
                            <Link href={r.source.href} className="hover:underline">
                              {r.source.label}
                            </Link>
                            {r.kind === "block" && " · Block"}
                          </span>
                          <Link href={r.href} className="text-base font-semibold text-link hover:underline">
                            {plainText(r.title) || "Untitled"}
                          </Link>
                          {r.snippet && (
                            <p className="text-sm leading-normal text-muted-foreground">
                              {r.snippet.map((p, i) =>
                                p.hit ? (
                                  <mark key={i} className="bg-roam-highlight px-0.5 text-inherit">
                                    {p.text}
                                  </mark>
                                ) : (
                                  p.text
                                ),
                              )}
                            </p>
                          )}
                          <span className="flex flex-wrap items-center gap-x-2 text-xs">
                            {r.tags.slice(0, 6).map((t) => (
                              <Link key={t} href={href(s, { tags: s.tags.includes(t) ? s.tags : toggleTag(s.tags, t) })} className="text-roam-ref hover:underline">
                                #{t}
                              </Link>
                            ))}
                            <span className="text-muted-foreground">Updated {formatDate(r.updatedAt)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {pageCount > 1 && (
                    <nav className="flex items-center justify-between text-sm" aria-label="Pagination">
                      {s.page > 1 ? (
                        <Link href={href(s, { page: s.page - 1 })} rel="prev" className={buttonVariants({ variant: "outline", size: "sm" })}>
                          ← Previous
                        </Link>
                      ) : (
                        <span />
                      )}
                      <span className="text-muted-foreground">
                        Page {Math.min(s.page, pageCount)} of {pageCount}
                      </span>
                      {s.page < pageCount ? (
                        <Link href={href(s, { page: s.page + 1 })} rel="next" className={buttonVariants({ variant: "outline", size: "sm" })}>
                          Next →
                        </Link>
                      ) : (
                        <span />
                      )}
                    </nav>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
