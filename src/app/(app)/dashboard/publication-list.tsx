import { ArrowDown, ArrowUp, LockIcon } from "lucide-react";
import Link from "next/link";
import { ManageDialog } from "@/components/manage/manage-dialog";
import { Badge } from "@/components/ui/badge";
import type { graph, publication } from "@/db/schema";
import type { ManageData } from "@/lib/manage-data";
import { publicationPath } from "@/lib/publications";
import { AccessMenu } from "./access-menu";

// One grid for header and rows, so columns line up from sm up. Below sm each row stacks instead.
const COLUMNS = "sm:grid sm:grid-cols-[minmax(0,1fr)_4.5rem_11rem_7.5rem_6.5rem] sm:items-center sm:gap-3";

const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { dateStyle: "medium" });

type Row = Pick<
  typeof publication.$inferSelect,
  | "id"
  | "rootUid"
  | "kind"
  | "title"
  | "visibility"
  | "discoverable"
  | "removedAt"
  | "removedReason"
  | "updatedAt"
  | "inGraph"
  | "access"
>;

/** A sortable column header: where clicking it goes, and which way it's sorted now, if at all. */
export type SortHeader = { href: string; dir: "asc" | "desc" | null };

/** A graph's published pages: a stacked list on phones, columns on wider screens. */
export function PublicationList({
  g,
  rows,
  votes,
  discoverBlocked,
  manage,
  sort,
}: {
  g: typeof graph.$inferSelect;
  /** Per publication, for pages the viewer can manage. Others are read-only. */
  manage: Map<string, ManageData>;
  rows: Row[];
  /** Upvotes per publication id, for pages on Discover. */
  votes: Map<string, number>;
  discoverBlocked?: string;
  sort?: { title: SortHeader; updated: SortHeader };
}) {
  return (
    <div className="text-sm">
      <div className={`hidden border-b px-2 pb-2 font-medium text-muted-foreground ${COLUMNS}`}>
        <HeaderCell label="Title" sort={sort?.title} />
        <span>Type</span>
        <span>In graph</span>
        <HeaderCell label="Updated" sort={sort?.updated} />
        <span />
      </div>
      <ul className="divide-y">
        {rows.map((p) => {
          const m = manage.get(p.id);
          const gAccess = p.access === "inherit" ? g.defaultAccess : p.access;
          const firstEntry = m?.entries[0];
          return (
          <li
            key={p.id}
            id={`pub-${p.id}`}
            className={`flex scroll-mt-4 flex-col gap-2 px-2 py-3 ${COLUMNS} sm:py-2`}
          >
            <div className="min-w-0">
              <Link
                href={p.inGraph || !firstEntry ? publicationPath(g.name, p.rootUid, p.title) : firstEntry.path}
                className="line-clamp-2 font-medium break-words text-link hover:underline sm:line-clamp-1 sm:font-normal"
              >
                {p.title}
              </Link>
              {m && m.entries.length > 0 && (
                <p className="truncate text-xs text-muted-foreground">
                  In {m.entries.map((e) => e.collectionName).join(", ")}
                </p>
              )}
            </div>
            {/* Phones: type and date share a line under the title. */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground sm:contents">
              <span>
                <Badge variant="outline">{p.kind}</Badge>
              </span>
              <span className="order-last sm:order-none sm:hidden">Updated {fmtDate(p.updatedAt)}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 sm:contents">
              <div className="min-w-0">
                {p.removedAt ? (
                  <>
                    <Badge variant="destructive">Removed by moderator</Badge>
                    {p.removedReason && (
                      <p className="mt-1 text-xs text-muted-foreground">{p.removedReason}</p>
                    )}
                  </>
                ) : !p.inGraph ? (
                  <Badge variant="outline">Collections only</Badge>
                ) : !m?.canManagePage ? (
                  <Badge variant="outline">{p.visibility === "public" ? "Listed" : "Not listed"}</Badge>
                ) : (
                  <AccessMenu
                    publicationId={p.id}
                    access={p.visibility === "unlisted" ? "unlisted" : p.discoverable ? "discover" : "public"}
                    frontPage={g.frontPage}
                    indexable={g.indexable}
                    discoverBlocked={discoverBlocked}
                    place={m.graphPlace}
                  />
                )}
                {!p.removedAt && p.inGraph && gAccess !== "open" && (
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <LockIcon className="size-3" /> {gAccess === "password" ? "Password" : "Members only"}
                  </p>
                )}
                {!p.removedAt && p.discoverable && p.visibility === "public" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {(votes.get(p.id) ?? 0).toLocaleString("en-US")}{" "}
                    {votes.get(p.id) === 1 ? "upvote" : "upvotes"}
                  </p>
                )}
              </div>
              <span className="hidden text-muted-foreground sm:block">{fmtDate(p.updatedAt)}</span>
              <div className="sm:text-right">{!p.removedAt && m && <ManageDialog data={m} />}</div>
            </div>
          </li>
          );
        })}
      </ul>
    </div>
  );
}

function HeaderCell({ label, sort }: { label: string; sort?: SortHeader }) {
  if (!sort) return <span>{label}</span>;
  return (
    <Link
      href={sort.href}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      {label}
      {sort.dir === "asc" && <ArrowUp className="size-3.5" aria-label="ascending" />}
      {sort.dir === "desc" && <ArrowDown className="size-3.5" aria-label="descending" />}
    </Link>
  );
}
