import { AccessIcon } from "@/components/privacy-icon";
import Link from "next/link";
import { lockExplanation } from "@/components/access-lock";
import { LISTING_LABELS } from "@/components/manage/labels";
import { ManageDialog } from "@/components/manage/manage-dialog";
import { Badge } from "@/components/ui/badge";
import type { collection, collectionEntry, publication } from "@/db/schema";
import type { ManageData } from "@/lib/manage-data";
import { entryPath } from "@/lib/publications";
import { AccessMenu } from "../../access-menu";
import { AllCheckbox, BulkSelect, RowCheckbox } from "../../bulk-select";
import { fmtDate, HeaderCell, type SortHeader } from "../../publication-list";

// Like the graph list, with room for reordering next to Manage.
const COLUMNS = "sm:grid sm:grid-cols-[minmax(0,1fr)_12.5rem_7.5rem_9rem] sm:items-center sm:gap-3";
import { EntryReorder } from "./entry-reorder";

export type EntryRowData = {
  entry: Pick<
    typeof collectionEntry.$inferSelect,
    "id" | "entryUid" | "listing" | "access" | "originGraphName" | "addedBy"
  >;
  pub: Pick<typeof publication.$inferSelect, "id" | "title" | "kind" | "removedAt" | "removedReason" | "updatedAt" | "tags">;
  addedByEmail: string | null;
};

/**
 * A collection's pages on the dashboard, laid out like a graph's list: listing and access per row,
 * Manage, bulk changes, and (in the owner's order) up and down.
 */
export function EntryList({
  c,
  rows,
  manage,
  discoverBlocked,
  reorder,
  sort,
}: {
  c: Pick<typeof collection.$inferSelect, "id" | "slug" | "name" | "defaultAccess">;
  rows: EntryRowData[];
  /** Per publication, for pages whose entry (or page) the viewer can manage. */
  manage: Map<string, ManageData>;
  discoverBlocked?: string;
  /** When rows are in the owner's full order: which row is first and last overall. */
  reorder?: { firstId?: string; lastId?: string };
  sort: { title: SortHeader; updated: SortHeader };
}) {
  const placeOf = (r: EntryRowData) => manage.get(r.pub.id)?.entries.find((e) => e.entryId === r.entry.id);
  const selectable = rows.filter((r) => !r.pub.removedAt && placeOf(r)?.canManage).map((r) => r.entry.id);

  return (
    <BulkSelect
      kind="collection"
      ids={selectable}
      tags={Object.fromEntries(rows.map((r) => [r.entry.id, r.pub.tags]))}
      graphName={c.name}
    >
      <div className="text-sm">
        <div className={`hidden border-b px-2 pb-2 font-medium text-muted-foreground ${COLUMNS}`}>
          <span className="flex items-center gap-2">
            <AllCheckbox />
            <HeaderCell label="Title" sort={sort.title} />
          </span>
          <span>Access · Visibility</span>
          <HeaderCell label="Updated" sort={sort.updated} />
          <span />
        </div>
        <ul className="divide-y">
          {rows.map((r) => {
            const { entry, pub } = r;
            const m = manage.get(pub.id);
            const place = placeOf(r);
            const access = entry.access === "inherit" ? c.defaultAccess : entry.access;
            return (
              <li
                key={entry.id}
                id={`entry-${entry.id}`}
                className={`flex scroll-mt-4 flex-col gap-2 px-2 py-3 ${COLUMNS} sm:py-2`}
              >
                <div className="flex min-w-0 items-start gap-2">
                  <span className="flex h-5 w-4 shrink-0 items-center">
                    {selectable.includes(entry.id) && <RowCheckbox id={entry.id} title={pub.title} />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-start gap-2">
                      <Link
                        href={entryPath(c.slug, entry.entryUid, pub.title)}
                        className="line-clamp-2 min-w-0 break-words text-foreground hover:underline sm:line-clamp-1"
                      >
                        {pub.title}
                      </Link>
                      {pub.kind === "block" && (
                        <Badge variant="secondary" className="mt-px shrink-0">
                          Block
                        </Badge>
                      )}
                      {m?.needsRepublish && (
                        <Badge
                          variant="outline"
                          title="A password it was encrypted with was reset. Republish this page from Roam to make it readable everywhere again."
                          className="mt-px shrink-0 cursor-help border-amber-500/60 text-amber-700 dark:text-amber-400"
                        >
                          Needs republish
                        </Badge>
                      )}
                    </div>
                    {pub.tags.length > 0 && (
                      <p className="truncate text-xs text-roam-ref">
                        {pub.tags.slice(0, 5).map((t) => `#${t}`).join(" ")}
                        {pub.tags.length > 5 && <span className="text-muted-foreground"> +{pub.tags.length - 5}</span>}
                      </p>
                    )}
                    <p className="truncate text-xs text-muted-foreground">
                      From {entry.originGraphName} · added by {r.addedByEmail ?? "a former member"}
                    </p>
                  </div>
                </div>
                {/* Phones: the date goes under the title. */}
                <span className="text-xs text-muted-foreground sm:hidden">Updated {fmtDate(pub.updatedAt)}</span>
                <div className="flex flex-wrap items-center justify-between gap-2 sm:contents">
                  <div className="min-w-0">
                    {pub.removedAt ? (
                      <>
                        <Badge variant="destructive">Removed by moderator</Badge>
                        {pub.removedReason && <p className="mt-1 text-xs text-muted-foreground">{pub.removedReason}</p>}
                      </>
                    ) : place?.canManage ? (
                      <AccessMenu
                        target={{ kind: "entry", entryId: entry.id }}
                        access={entry.listing === "listed" ? "public" : entry.listing}
                        discoverBlocked={place.container.discoverBlocked}
                        place={place}
                        searchable={m?.searchable}
                      />
                    ) : (
                      <Badge variant="outline">{LISTING_LABELS[entry.listing]}</Badge>
                    )}
                    {/* The access menu names it already. */}
                    {!pub.removedAt && access !== "open" && !place?.canManage && (
                      <p
                        title={lockExplanation(access, "collection", c.name)}
                        className="mt-1 flex w-fit cursor-help items-center gap-1 text-xs text-muted-foreground"
                      >
                        <AccessIcon access={access} className="size-3" />{" "}
                        {access === "password" ? "Password" : `Members of ${c.name}`}
                      </p>
                    )}
                    {!pub.removedAt && entry.listing === "discover" && discoverBlocked && (
                      <p className="mt-1 text-xs text-muted-foreground">Discover is paused: {discoverBlocked}</p>
                    )}
                  </div>
                  <span className="hidden text-muted-foreground sm:block">{fmtDate(pub.updatedAt)}</span>
                  <div className="flex items-center justify-end gap-1">
                    {reorder && (
                      <EntryReorder
                        entryId={entry.id}
                        first={entry.id === reorder.firstId}
                        last={entry.id === reorder.lastId}
                      />
                    )}
                    {!pub.removedAt && m && <ManageDialog data={m} />}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </BulkSelect>
  );
}
