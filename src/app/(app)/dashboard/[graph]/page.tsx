import { count, eq, inArray } from "drizzle-orm";
import { SearchIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { graph, publication, publicationVote } from "@/db/schema";
import { graphRole } from "@/lib/graph-access";
import { graphPath } from "@/lib/graphs";
import { manageDataFor } from "@/lib/manage-data";
import { requireSession } from "@/lib/session";
import {
  ACCESS,
  ACCESS_LABELS,
  type AccessFilter,
  accessCounts,
  discoverBlocked,
  graphPagesPath,
  KINDS,
  type KindFilter,
  listHref,
  listOrder,
  listWhere,
  type ListState,
  PAGE_SIZE,
  parseListState,
  SORT_LABELS,
  SORTS,
  sortHref,
} from "../filters";
import { PublicationList } from "../publication-list";

export const metadata: Metadata = { title: "Published pages · Roam Publish" };

const KIND_LABELS: Record<KindFilter, string> = { page: "Pages", block: "Blocks" };

export default async function GraphPagesPage(props: PageProps<"/dashboard/[graph]">) {
  const { graph: graphName } = await props.params;
  const name = decodeURIComponent(graphName);
  const path = graphPagesPath(name);
  const session = await requireSession(path);
  const g = await db.query.graph.findFirst({ where: eq(graph.name, name) });
  // Owners and members see every page; members can only change the ones they published.
  const role = g ? await graphRole(session.user.id, g.id) : null;
  if (!g || !role) notFound();

  const state = parseListState(await props.searchParams);
  const where = listWhere(g.id, state);
  const [[totals], [{ matching }]] = await Promise.all([
    db.select({ total: count(), ...accessCounts }).from(publication).where(eq(publication.graphId, g.id)),
    db.select({ matching: count() }).from(publication).where(where),
  ]);
  const pageCount = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  const page = Math.min(state.page, pageCount);
  const rows = await db
    .select({
      id: publication.id,
      rootUid: publication.rootUid,
      kind: publication.kind,
      title: publication.title,
      visibility: publication.visibility,
      discoverable: publication.discoverable,
      removedAt: publication.removedAt,
      removedReason: publication.removedReason,
      updatedAt: publication.updatedAt,
      inGraph: publication.inGraph,
      access: publication.access,
    })
    .from(publication)
    .where(where)
    .orderBy(...listOrder(state))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const discoverIds = rows.filter((p) => p.discoverable).map((p) => p.id);
  const voteRows = discoverIds.length
    ? await db
        .select({ id: publicationVote.publicationId, n: count() })
        .from(publicationVote)
        .where(inArray(publicationVote.publicationId, discoverIds))
        .groupBy(publicationVote.publicationId)
    : [];
  const votes = new Map(voteRows.map((v) => [v.id, v.n]));
  const manage = await manageDataFor(session.user.id, rows.map((r) => r.id));

  const filtered = !!(state.access || state.kind || state.q);
  const header = (sort: "title" | "updated") => ({
    href: sortHref(path, state, sort),
    dir: state.sort === sort ? (state.desc ? ("desc" as const) : ("asc" as const)) : null,
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          ← Dashboard
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold break-words">{g.name}</h1>
          <div className="flex gap-2">
            {g.frontPage && (
              <Link href={graphPath(g.name)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                View front page
              </Link>
            )}
            <Link href={`${path}/members`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Members
            </Link>
            {role === "owner" && (
              <Link href={`${path}/settings`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Settings
              </Link>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {totals.total.toLocaleString("en-US")} published
        </p>
      </div>

      {g.suspendedAt && (
        <Alert variant="destructive">
          <AlertTitle>This graph was suspended by a moderator</AlertTitle>
          <AlertDescription>
            Its pages are hidden and publishing is turned off.
            {g.suspendedReason && <> Reason: {g.suspendedReason}</>}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Toolbar path={path} state={state} counts={{ all: totals.total, ...totals }} />

          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {filtered ? (
                <>
                  No pages match.{" "}
                  <Link href={path} className="text-link hover:underline">
                    Clear filters
                  </Link>
                </>
              ) : (
                "Nothing published yet. Right-click a page or block in Roam and choose Publish."
              )}
            </p>
          ) : (
            <PublicationList
              g={g}
              rows={rows}
              votes={votes}
              discoverBlocked={discoverBlocked(g)}
              manage={manage}
              sort={{ title: header("title"), updated: header("updated") }}
            />
          )}

          {matching > 0 && (
            <nav
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
              aria-label="Pagination"
            >
              <PageLink href={listHref(path, state, { page: page - 1 })} disabled={page <= 1} rel="prev">
                ← Previous
              </PageLink>
              <span className="text-muted-foreground">
                {((page - 1) * PAGE_SIZE + 1).toLocaleString("en-US")}–
                {Math.min(page * PAGE_SIZE, matching).toLocaleString("en-US")} of{" "}
                {matching.toLocaleString("en-US")}
              </span>
              <PageLink
                href={listHref(path, state, { page: page + 1 })}
                disabled={page >= pageCount}
                rel="next"
              >
                Next →
              </PageLink>
            </nav>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Search, filters and sort. Everything lives in the URL, so it works without JavaScript. */
function Toolbar({
  path,
  state,
  counts,
}: {
  path: string;
  state: ListState;
  counts: Record<AccessFilter | "all", number>;
}) {
  const chip = (active: boolean) =>
    buttonVariants({ variant: active ? "secondary" : "ghost", size: "sm", className: "gap-1.5" });
  const accessOptions: (AccessFilter | null)[] = [
    null,
    ...ACCESS.filter((a) => a !== "removed" || counts.removed > 0 || state.access === "removed"),
  ];

  return (
    <div className="flex flex-col gap-3">
      <form action={path} className="flex gap-2" role="search">
        {/* Searching keeps the other filters and the sort. */}
        {[...new URL(listHref(path, state, { q: "" }), "http://x").searchParams].map(([k, v]) => (
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

      <div className="flex flex-wrap items-center gap-1 text-sm" role="group" aria-label="Filter by setting">
        {accessOptions.map((a) => (
          <Link
            key={a ?? "all"}
            href={listHref(path, state, { access: a })}
            aria-current={state.access === a ? "true" : undefined}
            className={chip(state.access === a)}
          >
            {a ? ACCESS_LABELS[a] : "All"}
            <span className="text-muted-foreground tabular-nums">{counts[a ?? "all"].toLocaleString("en-US")}</span>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter by type">
          {([null, ...KINDS] as const).map((k) => (
            <Link
              key={k ?? "any"}
              href={listHref(path, state, { kind: k })}
              aria-current={state.kind === k ? "true" : undefined}
              className={chip(state.kind === k)}
            >
              {k ? KIND_LABELS[k] : "Any type"}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
          <span className="mr-1">Sort</span>
          {SORTS.map((s) => (
            <Link
              key={s}
              href={sortHref(path, state, s)}
              aria-current={state.sort === s ? "true" : undefined}
              className={chip(state.sort === s)}
            >
              {SORT_LABELS[s]}
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
          <Link href={listHref(path, state, { q: "" })} className="text-link hover:underline">
            Clear search
          </Link>
        </p>
      )}
    </div>
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
