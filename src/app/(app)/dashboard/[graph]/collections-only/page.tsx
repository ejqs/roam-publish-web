import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import { ChevronLeftIcon, FolderIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ManageDialog } from "@/components/manage/manage-dialog";
import { SealedTitleText } from "@/components/sealed-title";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/db";
import { collection, collectionEntry, graph, publication } from "@/db/schema";
import { collectionsOf } from "@/lib/collections";
import {
  collectionPagesPath,
  GRAPH_LIST,
  graphPagesPath,
  type ListConfig,
  listOrder,
  listWhere,
  ONLY_IN_COLLECTIONS,
  onlyInCollectionsPath,
  PAGE_SIZE,
  parseListState,
  sortHref,
  type Sort,
} from "@/lib/dashboard-filters";
import { sealedTitles } from "@/lib/encryption";
import { graphRole } from "@/lib/graph-access";
import { manageDataFor } from "@/lib/manage-data";
import { entryPlacePath } from "@/lib/publications";
import { requireSession } from "@/lib/session";
import { ListEmpty, ListPagination, ListToolbar } from "../../list-toolbar";
import { fmtDate, HeaderCell } from "../../publication-list";

export const metadata: Metadata = { title: "Only in collections · Roam Publish" };

const COLUMNS = "sm:grid sm:grid-cols-[minmax(0,1fr)_7.5rem_6.5rem] sm:items-center sm:gap-3";

/**
 * A graph's pages that are only in collections, which its Pages list leaves out and links here.
 * Filters are the collections they're in (by slug), so a page in two shows under both.
 */
export default async function OnlyInCollectionsPage(props: PageProps<"/dashboard/[graph]/collections-only">) {
  const { graph: graphName } = await props.params;
  const name = decodeURIComponent(graphName);
  const path = onlyInCollectionsPath(name);
  const session = await requireSession(path);
  const g = await db.query.graph.findFirst({ where: eq(graph.name, name) });
  const role = g ? await graphRole(session.user.id, g.id) : null;
  if (!g || !role) notFound();

  const base = and(eq(publication.graphId, g.id), ONLY_IN_COLLECTIONS)!;
  // A page counts in each collection that lists it; Unlisted entries are on the Unlisted tab.
  const places = await db
    .select({ id: collection.id, slug: collection.slug, name: collection.name, n: count() })
    .from(publication)
    .innerJoin(collectionEntry, and(eq(collectionEntry.publicationId, publication.id), ne(collectionEntry.listing, "unlisted")))
    .innerJoin(collection, eq(collection.id, collectionEntry.collectionId))
    .where(base)
    .groupBy(collection.id)
    .orderBy(collection.name);
  const cfg: ListConfig<string, Sort> = {
    ...GRAPH_LIST,
    filters: places.map((c) => c.slug),
    filterLabels: Object.fromEntries(places.map((c) => [c.slug, c.name])),
  };
  const state = parseListState(cfg, await props.searchParams);
  const inPlace = places.find((c) => c.slug === state.access);
  const where = and(
    base,
    listWhere(g.id, { ...state, access: null }),
    inPlace
      ? sql`exists (select 1 from ${collectionEntry} where ${collectionEntry.publicationId} = ${publication.id} and ${collectionEntry.collectionId} = ${inPlace.id} and ${collectionEntry.listing} <> 'unlisted')`
      : undefined,
  )!;
  const [[{ all }], [{ matching }]] = await Promise.all([
    db.select({ all: count() }).from(publication).where(base),
    db.select({ matching: count() }).from(publication).where(where),
  ]);
  const pageCount = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  const page = Math.min(state.page, pageCount);
  const listed = await db
    .select({
      id: publication.id,
      title: publication.title,
      kind: publication.kind,
      updatedAt: publication.updatedAt,
      encrypted: publication.encrypted,
      titleCipher: publication.titleCipher,
    })
    .from(publication)
    .where(where)
    .orderBy(...listOrder({ ...state, access: null }))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  // Where each row is: its collections, the first (or the filtered one) giving its link and title lock.
  const entries = listed.length
    ? await db
        .select({
          publicationId: collectionEntry.publicationId,
          id: collectionEntry.id,
          entryUid: collectionEntry.entryUid,
          listing: collectionEntry.listing,
          passwordHash: collectionEntry.passwordHash,
          passwordVersion: collectionEntry.passwordVersion,
          c: { id: collection.id, slug: collection.slug, name: collection.name, passwordHash: collection.passwordHash, passwordVersion: collection.passwordVersion },
        })
        .from(collectionEntry)
        .innerJoin(collection, eq(collection.id, collectionEntry.collectionId))
        .where(and(inArray(collectionEntry.publicationId, listed.map((p) => p.id)), ne(collectionEntry.listing, "unlisted")))
        .orderBy(collection.name)
    : [];
  const entriesOf = (id: string) => {
    const mine = entries.filter((e) => e.publicationId === id);
    return inPlace ? [...mine.filter((e) => e.c.id === inPlace.id), ...mine.filter((e) => e.c.id !== inPlace.id)] : mine;
  };
  const sealed = await sealedTitles(
    listed.map((p) => {
      const e = entriesOf(p.id)[0];
      return {
        ...p,
        lock: !e
          ? null
          : e.passwordHash
            ? { scope: "entry" as const, id: e.id, version: e.passwordVersion }
            : e.c.passwordHash
              ? { scope: "collection" as const, id: e.c.id, version: e.c.passwordVersion }
              : null,
      };
    }),
  );
  const [manage, mine] = await Promise.all([manageDataFor(session.user.id, listed.map((p) => p.id)), collectionsOf(session.user.id)]);
  const canOpen = new Set(mine.map((c) => c.id));

  const filtered = !!(state.access || state.kind || state.q);
  const header = (sort: "title" | "updated") => ({
    href: sortHref(cfg, path, state, sort),
    dir: state.sort === sort ? (state.desc ? ("desc" as const) : ("asc" as const)) : null,
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:py-12">
      <div className="flex flex-col gap-4">
        <Link href={graphPagesPath(g.name)} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeftIcon className="size-3.5" />
          {g.name}
        </Link>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold break-words">Only in collections</h1>
          <p className="text-sm text-muted-foreground">
            Pages from {g.name} that are in collections but not shown in the graph. Unlisted ones are on the{" "}
            <Link href="/dashboard/unlisted" className="text-link hover:underline">
              Unlisted tab
            </Link>
            .
          </p>
        </div>
      </div>

      <ListToolbar
        cfg={cfg}
        path={path}
        state={state}
        counts={{ all, ...Object.fromEntries(places.map((c) => [c.slug, c.n])) }}
        filterIcon={FolderIcon}
        filterLabel="Filter by collection"
      />

      <Card>
        <CardContent className="flex flex-col gap-4 text-sm">
          {listed.length === 0 ? (
            <ListEmpty filtered={filtered} path={path}>
              Every page from {g.name} is shown in the graph.
            </ListEmpty>
          ) : (
            <div>
              <div className={`hidden border-b px-2 pb-2 font-medium text-muted-foreground ${COLUMNS}`}>
                <HeaderCell label="Title" sort={header("title")} />
                <HeaderCell label="Updated" sort={header("updated")} />
                <span />
              </div>
              <ul className="divide-y">
                {listed.map((p) => {
                  const where = entriesOf(p.id);
                  const first = where[0];
                  const m = manage.get(p.id);
                  const st = sealed.get(p.id);
                  return (
                    <li key={p.id} className={`flex flex-col gap-1 px-2 py-3 ${COLUMNS} sm:py-2`}>
                      <div className="min-w-0">
                        <div className="flex items-start gap-2">
                          {first ? (
                            <Link
                              href={entryPlacePath(first.c.slug, first, p.title)}
                              className="line-clamp-2 min-w-0 break-words text-foreground hover:underline sm:line-clamp-1"
                            >
                              {st ? <SealedTitleText sealed={st} fallback={p.title} /> : p.title}
                            </Link>
                          ) : (
                            <span className="min-w-0 break-words">{p.title}</span>
                          )}
                          {p.kind === "block" && (
                            <Badge variant="secondary" className="mt-px shrink-0">
                              Block
                            </Badge>
                          )}
                        </div>
                        <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                          In{" "}
                          {where.map((e, i) => (
                            <span key={e.id}>
                              {canOpen.has(e.c.id) ? (
                                <Link href={collectionPagesPath(e.c.slug)} className="hover:text-foreground hover:underline">
                                  {e.c.name}
                                </Link>
                              ) : (
                                e.c.name
                              )}
                              {i < where.length - 1 && ","}
                            </span>
                          ))}
                        </p>
                      </div>
                      <div className="flex items-center justify-between gap-2 sm:contents">
                        <span className="text-xs text-muted-foreground sm:text-sm">
                          <span className="sm:hidden">Updated </span>
                          {fmtDate(p.updatedAt)}
                        </span>
                        <div className="sm:text-right">{m && <ManageDialog data={m} />}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <ListPagination cfg={cfg} path={path} state={state} page={page} matching={matching} />
        </CardContent>
      </Card>
    </div>
  );
}
