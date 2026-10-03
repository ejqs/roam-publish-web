import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { db } from "@/db";
import { collection, graph, profile, publication, report, user } from "@/db/schema";
import { graphPath } from "@/lib/graphs";
import { collectionPath, publicationPath } from "@/lib/publications";
import { REPORT_REASONS } from "@/lib/report-reasons";
import { plainText } from "@/lib/slug";
import { ModerateDialog } from "./moderate-dialog";
import { GraphDescriptionAction, ProfileActions } from "./description-actions";
import { CollectionActions, GraphActions, PublicationActions, UserActions } from "./target-actions";
import { ADMIN_PAGE_SIZE, FilterLinks, fmtDate, Pager, param, parsePage } from "./ui";

const STATUSES = ["open", "actioned", "dismissed"] as const;
type Status = (typeof STATUSES)[number];

// Reports are grouped by target in memory; this caps how many we look at per status.
const SCAN_LIMIT = 2000;

export default async function ReportsPage(props: PageProps<"/admin">) {
  const search = await props.searchParams;
  const s = param(search.status);
  const status: Status = STATUSES.includes(s as Status) ? (s as Status) : "open";
  const page = parsePage(param(search.page));

  const rows = await db
    .select({ r: report, g: graph, pub: publication, owner: user, prof: profile, col: collection })
    .from(report)
    .leftJoin(publication, eq(publication.id, report.publicationId))
    // A reported page's graph, also when it was reported from a collection.
    .leftJoin(graph, eq(graph.id, sql`coalesce(${report.graphId}, ${publication.graphId})`))
    .leftJoin(collection, eq(collection.id, report.collectionId))
    // The owner of the reported graph or page, the reported collection's owner, or the profile's user.
    .innerJoin(user, eq(user.id, sql`coalesce(${graph.userId}, ${collection.ownerId}, ${report.profileUserId})`))
    .leftJoin(profile, eq(profile.userId, report.profileUserId))
    .where(eq(report.status, status))
    .orderBy(desc(report.createdAt))
    .limit(SCAN_LIMIT);

  // One card per reported page, graph or profile. Rows are newest first.
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.pub
      ? `p:${row.pub.id}`
      : row.g
        ? `g:${row.g.id}`
        : row.col
          ? `c:${row.col.id}`
          : `u:${row.owner.id}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  // Most-reported first, then most recent.
  const all = [...groups.values()].sort((a, b) => b.length - a.length);
  const shown = all.slice((page - 1) * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <FilterLinks
        path="/admin"
        name="status"
        value={status}
        options={STATUSES.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))}
      />
      {shown.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No {status} reports</EmptyTitle>
            <EmptyDescription>
              {status === "open" ? "Nothing needs review right now." : "Nothing here yet."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        shown.map((list) => {
          const { g, pub, owner, prof, col } = list[0];
          const reasons = new Map<string, number>();
          for (const { r } of list) reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
          const title = pub
            ? plainText(pub.title) || "Untitled"
            : g
              ? g.name
              : col
                ? col.name
                : prof
                ? `@${prof.username}`
                : "Cleared profile";
          const href = pub && g
            ? publicationPath(g.name, pub.rootUid, pub.title)
            : g
              ? graphPath(g.name)
              : col
                ? collectionPath(col.slug)
                : prof
                  ? `/u/${prof.username}`
                  : undefined;
          const key = pub?.id ?? g?.id ?? col?.id ?? `u:${owner.id}`;
          return (
            <section key={key} className="flex flex-col gap-3 rounded-sm border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{pub ? pub.kind : g ? "graph" : col ? "collection" : "profile"}</Badge>
                    {href ? (
                      <Link href={href} target="_blank" className="font-medium break-all text-link hover:underline">
                        {title}
                      </Link>
                    ) : (
                      <span className="font-medium text-muted-foreground">{title}</span>
                    )}
                    {pub?.removedAt && <Badge variant="destructive">removed</Badge>}
                    {g?.suspendedAt && <Badge variant="destructive">graph suspended</Badge>}
                    {col?.suspendedAt && <Badge variant="destructive">collection suspended</Badge>}
                    {owner.banned && <Badge variant="destructive">owner banned</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {pub && g && <>in {g.name} · </>}
                    {col && <>{pub ? "reported in" : "collection"} {col.name} · </>}owner {owner.email}
                  </p>
                  {!g && !col && prof?.bio && (
                    <p className="mt-2 border-l-2 pl-2 text-sm break-words">{prof.bio}</p>
                  )}
                  {g && !pub && g.description && (
                    <p className="mt-2 border-l-2 pl-2 text-sm break-words">{g.description}</p>
                  )}
                </div>
                <Badge variant="secondary">
                  {list.length} {list.length === 1 ? "report" : "reports"}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[...reasons].map(([reason, n]) => (
                  <Badge key={reason} variant="outline">
                    {REPORT_REASONS[reason as keyof typeof REPORT_REASONS]}
                    {n > 1 && ` ×${n}`}
                  </Badge>
                ))}
              </div>
              <ul className="flex flex-col divide-y border-y text-sm">
                {list.slice(0, 5).map(({ r }) => (
                  <li key={r.id} className="flex flex-col gap-0.5 py-2">
                    <span className="text-xs text-muted-foreground">
                      {fmtDate(r.createdAt)} · {REPORT_REASONS[r.reason]}
                      {r.reporterEmail && (
                        <> · {r.reporterEmail.includes("@") ? r.reporterEmail : `deleted account ${r.reporterEmail.slice(0, 8)}`}</>
                      )}
                    </span>
                    {r.details ? (
                      <ReportDetails text={r.details} />
                    ) : (
                      <span className="text-muted-foreground italic">No details</span>
                    )}
                  </li>
                ))}
                {list.length > 5 && (
                  <li className="py-2 text-xs text-muted-foreground">and {list.length - 5} more</li>
                )}
              </ul>
              {status === "open" && (
                <div className="flex flex-wrap gap-2">
                  {pub && g && <PublicationActions pub={pub} graphName={g.name} />}
                  {g && !pub && g.description && <GraphDescriptionAction graphId={g.id} graphName={g.name} />}
                  {g && <GraphActions g={g} />}
                  {col && !pub && <CollectionActions c={col} />}
                  {!g && !col && prof && (
                    <ProfileActions userId={owner.id} username={prof.username} hasBio={!!prof.bio} />
                  )}
                  <UserActions owner={owner} />
                  <ModerateDialog
                    op="dismiss"
                    targetId={pub?.id ?? g?.id ?? col?.id ?? owner.id}
                    targetType={pub ? "publication" : g ? "graph" : col ? "collection" : "profile"}
                    subject={title}
                    description="Marks these reports as reviewed with no action. Nobody is emailed."
                  />
                </div>
              )}
            </section>
          );
        })
      )}
      <Pager path="/admin" params={{ status: status === "open" ? "" : status }} page={page} total={all.length} />
    </div>
  );
}

const PREVIEW = 240;

/** Long reports start as a preview, so a card's actions stay within reach on phones. */
function ReportDetails({ text }: { text: string }) {
  if (text.length <= PREVIEW + 40) return <span className="whitespace-pre-wrap break-words">{text}</span>;
  return (
    <details className="group whitespace-pre-wrap break-words">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">
          {text.slice(0, PREVIEW).trimEnd()}… <span className="text-link">more</span>
        </span>
        <span className="hidden text-link group-open:inline">Show less</span>
      </summary>
      {text}
    </details>
  );
}
