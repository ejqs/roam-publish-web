import { count, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/db";
import { graph, publication, publicationVote } from "@/db/schema";
import { graphRole } from "@/lib/graph-access";
import { graphPath } from "@/lib/graphs";
import { manageDataFor } from "@/lib/manage-data";
import { requireSession } from "@/lib/session";
import {
  accessCounts,
  discoverBlocked,
  GRAPH_LIST,
  graphPagesPath,
  listOrder,
  listWhere,
  PAGE_SIZE,
  parseListState,
  sortHref,
} from "../filters";
import { ListEmpty, ListPagination, ListToolbar } from "../list-toolbar";
import { PublicationList } from "../publication-list";

export const metadata: Metadata = { title: "Published pages · Roam Publish" };

export default async function GraphPagesPage(props: PageProps<"/dashboard/[graph]">) {
  const { graph: graphName } = await props.params;
  const name = decodeURIComponent(graphName);
  const path = graphPagesPath(name);
  const session = await requireSession(path);
  const g = await db.query.graph.findFirst({ where: eq(graph.name, name) });
  // Owners and members see every page; members can only change the ones they published.
  const role = g ? await graphRole(session.user.id, g.id) : null;
  if (!g || !role) notFound();

  const state = parseListState(GRAPH_LIST, await props.searchParams);
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
    href: sortHref(GRAPH_LIST, path, state, sort),
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
          <ListToolbar
            cfg={GRAPH_LIST}
            path={path}
            state={state}
            counts={{ all: totals.total, ...totals }}
            hidden={["removed"]}
          />

          {rows.length === 0 ? (
            <ListEmpty filtered={filtered} path={path}>
              Nothing published yet. Right-click a page or block in Roam and choose Publish.
            </ListEmpty>
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

          <ListPagination cfg={GRAPH_LIST} path={path} state={state} page={page} matching={matching} />
        </CardContent>
      </Card>
    </div>
  );
}
