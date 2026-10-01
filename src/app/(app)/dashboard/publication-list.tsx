import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { graph, publication } from "@/db/schema";
import { publicationPath } from "@/lib/publications";
import { AccessMenu } from "./access-menu";
import { unpublish } from "./actions";

// One grid for header and rows, so columns line up from sm up. Below sm each row stacks instead.
const COLUMNS = "sm:grid sm:grid-cols-[minmax(0,1fr)_4.5rem_11rem_7.5rem_6.5rem] sm:items-center sm:gap-3";

const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { dateStyle: "medium" });

/** A graph's published pages: a stacked list on phones, columns on wider screens. */
export function PublicationList({
  g,
  rows,
  votes,
  discoverBlocked,
}: {
  g: typeof graph.$inferSelect;
  rows: (typeof publication.$inferSelect)[];
  /** Upvotes per publication id, for pages on Discover. */
  votes: Map<string, number>;
  discoverBlocked?: string;
}) {
  return (
    <div className="text-sm">
      <div className={`hidden border-b px-2 pb-2 font-medium text-muted-foreground ${COLUMNS}`}>
        <span>Title</span>
        <span>Type</span>
        <span>Visibility</span>
        <span>Updated</span>
        <span />
      </div>
      <ul className="divide-y">
        {rows.map((p) => (
          <li
            key={p.id}
            id={`pub-${p.id}`}
            className={`flex scroll-mt-4 flex-col gap-2 px-2 py-3 ${COLUMNS} sm:py-2`}
          >
            <Link
              href={publicationPath(g.name, p.rootUid, p.title)}
              className="line-clamp-2 font-medium break-words text-link hover:underline sm:line-clamp-1 sm:font-normal"
            >
              {p.title}
            </Link>
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
                ) : (
                  <AccessMenu
                    publicationId={p.id}
                    access={p.visibility === "unlisted" ? "unlisted" : p.discoverable ? "discover" : "public"}
                    frontPage={g.frontPage}
                    indexable={g.indexable}
                    discoverBlocked={discoverBlocked}
                  />
                )}
                {!p.removedAt && p.discoverable && p.visibility === "public" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {(votes.get(p.id) ?? 0).toLocaleString("en-US")}{" "}
                    {votes.get(p.id) === 1 ? "upvote" : "upvotes"}
                  </p>
                )}
              </div>
              <span className="hidden text-muted-foreground sm:block">{fmtDate(p.updatedAt)}</span>
              <div className="sm:text-right">
                {!p.removedAt && (
                  <form action={unpublish.bind(null, p.id)}>
                    <Button type="submit" variant="ghost" size="sm" className="text-muted-foreground">
                      Unpublish
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
