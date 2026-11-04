import { and, desc, eq, inArray, or } from "drizzle-orm";
import type { Metadata } from "next";
import { BookIcon, FolderIcon } from "lucide-react";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { ManageDialog } from "@/components/manage/manage-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/db";
import { collection, collectionEntry, publication } from "@/db/schema";
import { collectionsOf } from "@/lib/collections";
import { UNLISTED_ENTRY, UNLISTED_IN_GRAPH, unlistedTabPath } from "@/lib/dashboard-filters";
import { graphsOf } from "@/lib/graph-access";
import { manageDataFor } from "@/lib/manage-data";
import { entryPlacePath, linkPath } from "@/lib/publications";
import { requireSession } from "@/lib/session";
import { DashboardShell } from "../dashboard-shell";

export const metadata: Metadata = { title: "Unlisted · Roam Publish" };

/** More than anyone keeps Unlisted; the tab shows the most recently updated this many of each kind. */
const LIMIT = 500;

const fmt = (d: Date) => d.toLocaleDateString("en-US", { dateStyle: "medium" });
const absolute = (path: string) => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000") + path;
const shown = (path: string) => absolute(path).replace(/^https?:\/\//, "");

type Row = {
  key: string;
  publicationId: string;
  title: string;
  path: string;
  updatedAt: Date;
  /** Where it lives, for its owner: readers never see this. */
  from: { kind: "graph" | "collection"; name: string; key: string };
};

/**
 * Every Unlisted page in the graphs and collections someone belongs to, one row per link, since
 * Unlisted pages stand apart from the places they're in: their links and pages don't name them.
 * Graph and collection Pages lists leave them out and point here.
 */
export default async function UnlistedPage(props: PageProps<"/dashboard/unlisted">) {
  const session = await requireSession("/dashboard/unlisted");
  const me = session.user.id;
  const fromParam = (await props.searchParams).from;
  const from = typeof fromParam === "string" ? fromParam : null;
  const [graphs, collections] = await Promise.all([graphsOf(me), collectionsOf(me)]);
  const graphIds = graphs.map((g) => g.id);
  const collectionIds = collections.map((c) => c.id);
  const graphName = new Map(graphs.map((g) => [g.id, g.name]));

  const [inGraphs, inCollections] = await Promise.all([
    graphIds.length
      ? db
          .select({ id: publication.id, graphId: publication.graphId, title: publication.title, linkId: publication.linkId, updatedAt: publication.updatedAt })
          .from(publication)
          .where(and(inArray(publication.graphId, graphIds), UNLISTED_IN_GRAPH))
          .orderBy(desc(publication.updatedAt))
          .limit(LIMIT)
      : [],
    graphIds.length || collectionIds.length
      ? db
          .select({
            entryId: collectionEntry.id,
            entryUid: collectionEntry.entryUid,
            listing: collectionEntry.listing,
            publicationId: publication.id,
            title: publication.title,
            updatedAt: publication.updatedAt,
            name: collection.name,
            slug: collection.slug,
          })
          .from(collectionEntry)
          .innerJoin(publication, eq(publication.id, collectionEntry.publicationId))
          .innerJoin(collection, eq(collection.id, collectionEntry.collectionId))
          .where(
            and(
              UNLISTED_ENTRY,
              or(
                collectionIds.length ? inArray(collectionEntry.collectionId, collectionIds) : undefined,
                graphIds.length ? inArray(publication.graphId, graphIds) : undefined,
              ),
            ),
          )
          .orderBy(desc(publication.updatedAt))
          .limit(LIMIT)
      : [],
  ]);

  const all: Row[] = [
    ...inGraphs.map((p) => {
      const name = graphName.get(p.graphId)!;
      return {
        key: p.id,
        publicationId: p.id,
        title: p.title,
        path: linkPath(p.linkId, p.title),
        updatedAt: p.updatedAt,
        from: { kind: "graph" as const, name, key: `g:${name}` },
      };
    }),
    ...inCollections.map((e) => ({
      key: e.entryId,
      publicationId: e.publicationId,
      title: e.title,
      path: entryPlacePath(e.slug, e, e.title),
      updatedAt: e.updatedAt,
      from: { kind: "collection" as const, name: e.name, key: `c:${e.slug}` },
    })),
  ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  const places = [...new Map(all.map((r) => [r.from.key, r.from])).values()];
  const rows = from ? all.filter((r) => r.from.key === from) : all;
  const manage = await manageDataFor(me, [...new Set(rows.map((r) => r.publicationId))]);

  return (
    <DashboardShell
      current="/dashboard/unlisted"
      userId={me}
      description="Pages anyone with the link can read. They aren't listed anywhere, and their links and pages don't name the graph or collection they're in."
    >
      {places.length > 1 && (
        <nav aria-label="Filter by graph or collection" className="flex flex-wrap gap-1">
          <FilterChip label="All" n={all.length} href={unlistedTabPath()} active={!from} />
          {places.map((p) => (
            <FilterChip
              key={p.key}
              label={p.name}
              n={all.filter((r) => r.from.key === p.key).length}
              href={unlistedTabPath(p.kind === "graph" ? { graph: p.name } : { collection: p.key.slice(2) })}
              active={from === p.key}
              kind={p.kind}
            />
          ))}
        </nav>
      )}
      {rows.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            No Unlisted pages{from ? " here" : ""}. Pages you set to Unlisted show up here with their links.
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-sm border bg-card text-sm">
          <div className={`hidden border-b px-4 py-2 font-medium text-muted-foreground sm:grid ${COLUMNS}`}>
            <span>Title</span>
            <span>Link</span>
            <span>Last updated</span>
            <span />
          </div>
          <ul className="divide-y">
            {rows.map((r) => {
              const m = manage.get(r.publicationId);
              const Icon = r.from.kind === "graph" ? BookIcon : FolderIcon;
              return (
                <li key={r.key} className={`flex flex-col gap-1.5 px-4 py-3 sm:grid sm:items-center sm:gap-4 ${COLUMNS}`}>
                  <div className="min-w-0">
                    <Link href={r.path} className="line-clamp-2 break-words text-foreground hover:underline">
                      {r.title}
                    </Link>
                    <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                      <Icon className="size-3 shrink-0" aria-label={r.from.kind === "graph" ? "Graph" : "Collection"} />
                      <span className="truncate">{r.from.name}</span>
                    </p>
                  </div>
                  <div className="flex min-w-0 items-center gap-1">
                    <Link href={r.path} className="truncate font-mono text-xs text-link hover:underline">
                      {shown(r.path)}
                    </Link>
                    <CopyButton text={absolute(r.path)} variant="ghost" size="icon-xs" />
                  </div>
                  <div className="flex items-center justify-between gap-2 sm:contents">
                    <span className="text-xs text-muted-foreground sm:text-sm">{fmt(r.updatedAt)}</span>
                    <div className="sm:text-right">{m && <ManageDialog data={m} />}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </DashboardShell>
  );
}

const COLUMNS = "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.6fr)_7rem_5rem]";

function FilterChip({ label, n, href, active, kind }: { label: string; n: number; href: string; active: boolean; kind?: "graph" | "collection" }) {
  const Icon = kind === "graph" ? BookIcon : kind === "collection" ? FolderIcon : null;
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`flex items-center gap-1.5 rounded-sm px-2 py-1 text-sm ${
        active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {Icon && <Icon className="size-3.5" />}
      {label} <span className="text-muted-foreground tabular-nums">{n.toLocaleString("en-US")}</span>
    </Link>
  );
}
