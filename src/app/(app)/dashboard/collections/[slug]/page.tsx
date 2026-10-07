import { count, eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/db";
import { collectionEntry, publication, user } from "@/db/schema";
import { collectionRole, loadCollection } from "@/lib/collections";
import { manageDataFor } from "@/lib/manage-data";
import { collectionPath } from "@/lib/publications";
import { requireSession } from "@/lib/session";
import {
  COLLECTION_LIST,
  collectionPagesPath,
  entryCounts,
  entryListOrder,
  entryListWhere,
  PAGE_SIZE,
  parseListState,
  sortHref,
} from "@/lib/dashboard-filters";
import { ListEmpty, ListPagination, ListToolbar } from "../../list-toolbar";
import { ResourceHeader, resourceTabs } from "../../section-tabs";
import { EntryList } from "./entry-list";

export const metadata: Metadata = { title: "Collection · Roam Publish" };

export default async function CollectionDashboardPage(props: PageProps<"/dashboard/collections/[slug]">) {
  const { slug } = await props.params;
  const session = await requireSession(`/dashboard/collections/${slug}`);
  const c = await loadCollection(decodeURIComponent(slug));
  if (!c) notFound();
  const role = await collectionRole(session.user.id, c.id);
  if (!role) notFound();
  const isOwner = role === "owner";
  const me = session.user.id;
  const path = collectionPagesPath(c.slug);

  const state = parseListState(COLLECTION_LIST, await props.searchParams);
  const where = entryListWhere(c.id, state);
  const [[totals], [{ matching }]] = await Promise.all([
    db
      .select({ total: count(), ...entryCounts })
      .from(collectionEntry)
      .innerJoin(publication, eq(publication.id, collectionEntry.publicationId))
      .where(eq(collectionEntry.collectionId, c.id)),
    db
      .select({ matching: count() })
      .from(collectionEntry)
      .innerJoin(publication, eq(publication.id, collectionEntry.publicationId))
      .where(where),
  ]);
  const pageCount = Math.max(1, Math.ceil(matching / PAGE_SIZE));
  const page = Math.min(state.page, pageCount);
  const rows = await db
    .select({
      entry: {
        id: collectionEntry.id,
        entryUid: collectionEntry.entryUid,
        listing: collectionEntry.listing,
        access: collectionEntry.access,
        originGraphName: collectionEntry.originGraphName,
        addedBy: collectionEntry.addedBy,
      },
      pub: {
        id: publication.id,
        title: publication.title,
        kind: publication.kind,
        removedAt: publication.removedAt,
        removedReason: publication.removedReason,
        updatedAt: publication.updatedAt,
        tags: publication.tags,
      },
      addedByEmail: user.email,
    })
    .from(collectionEntry)
    .innerJoin(publication, eq(publication.id, collectionEntry.publicationId))
    .leftJoin(user, eq(user.id, collectionEntry.addedBy))
    .where(where)
    .orderBy(...entryListOrder(state))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const manage = await manageDataFor(me, rows.map((r) => r.pub.id));

  const discoverBlocked = c.suspendedAt
    ? "This collection is suspended."
    : c.indexAccess !== "open"
      ? "The collection's page is protected, so it can't list pages on Discover."
      : !c.indexable
        ? "Turn on search engines to use Discover."
        : undefined;
  const filtered = !!(state.access || state.kind || state.q);
  // Up and down only make sense on the owner's whole order.
  const inOrder = isOwner && state.sort === "order" && !state.desc && !filtered;
  const header = (sort: "title" | "updated") => ({
    href: sortHref(COLLECTION_LIST, path, state, sort),
    dir: state.sort === sort ? (state.desc ? ("desc" as const) : ("asc" as const)) : null,
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:py-12">
      <ResourceHeader
        name={c.name}
        caption={
          <>
            {totals.total.toLocaleString("en-US")} {totals.total === 1 ? "page" : "pages"} ·{" "}
            <Link href={collectionPath(c.slug)} className="text-link hover:underline">
              roam.pub{collectionPath(c.slug)}
            </Link>
            {c.suspendedAt && (
              <p className="text-destructive">
                Suspended by a moderator{c.suspendedReason ? `: ${c.suspendedReason}` : "."}
              </p>
            )}
          </>
        }
        view={{ href: collectionPath(c.slug), label: "View collection" }}
        tabs={resourceTabs(path, isOwner)}
        current={path}
      />

      <ListToolbar
        cfg={COLLECTION_LIST}
        path={path}
        state={state}
        counts={{ all: totals.total, ...totals }}
        hidden={["removed"]}
      />

      {/* overflow-visible so the bulk-change bar can stick while scrolling. */}
      <Card className="overflow-visible">
        <CardContent className="flex flex-col gap-4">
          {rows.length === 0 ? (
            <ListEmpty filtered={filtered} path={path}>
              No pages yet. Add pages from a graph&apos;s list or a published page&apos;s Manage button.
            </ListEmpty>
          ) : (
            <EntryList
              c={c}
              rows={rows}
              manage={manage}
              discoverBlocked={discoverBlocked}
              reorder={
                inOrder
                  ? {
                      firstId: page === 1 ? rows[0].entry.id : undefined,
                      lastId: page === pageCount ? rows[rows.length - 1].entry.id : undefined,
                    }
                  : undefined
              }
              sort={{ title: header("title"), updated: header("updated") }}
            />
          )}
          <ListPagination cfg={COLLECTION_LIST} path={path} state={state} page={page} matching={matching} />
        </CardContent>
      </Card>

    </div>
  );
}
