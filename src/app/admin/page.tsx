import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { db } from "@/db";
import { graph, publication, report, user } from "@/db/schema";
import { graphPath } from "@/lib/graphs";
import { publicationPath } from "@/lib/publications";
import { REPORT_REASONS } from "@/lib/report-reasons";
import { plainText } from "@/lib/slug";
import { ModerateDialog } from "./moderate-dialog";
import { GraphActions, PublicationActions, UserActions } from "./target-actions";
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
    .select({ r: report, g: graph, pub: publication, owner: user })
    .from(report)
    .innerJoin(graph, eq(graph.id, report.graphId))
    .innerJoin(user, eq(user.id, graph.userId))
    .leftJoin(publication, eq(publication.id, report.publicationId))
    .where(eq(report.status, status))
    .orderBy(desc(report.createdAt))
    .limit(SCAN_LIMIT);

  // One card per reported page, or per graph for graph-level reports. Rows are newest first.
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.pub ? `p:${row.pub.id}` : `g:${row.g.id}`;
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
          const { g, pub, owner } = list[0];
          const reasons = new Map<string, number>();
          for (const { r } of list) reasons.set(r.reason, (reasons.get(r.reason) ?? 0) + 1);
          const title = pub ? plainText(pub.title) || "Untitled" : g.name;
          const href = pub ? publicationPath(g.name, pub.rootUid, pub.title) : graphPath(g.name);
          return (
            <section key={pub?.id ?? g.id} className="flex flex-col gap-3 rounded-sm border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{pub ? pub.kind : "graph"}</Badge>
                    <Link href={href} target="_blank" className="font-medium break-all text-link hover:underline">
                      {title}
                    </Link>
                    {pub?.removedAt && <Badge variant="destructive">removed</Badge>}
                    {g.suspendedAt && <Badge variant="destructive">graph suspended</Badge>}
                    {owner.banned && <Badge variant="destructive">owner banned</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {pub && <>in {g.name} · </>}owner {owner.email}
                  </p>
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
                      {r.reporterEmail && <> · {r.reporterEmail}</>}
                    </span>
                    {r.details ? (
                      <span className="whitespace-pre-wrap break-words">{r.details}</span>
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
                  {pub && <PublicationActions pub={pub} graphName={g.name} />}
                  <GraphActions g={g} />
                  <UserActions owner={owner} />
                  <ModerateDialog
                    op="dismiss"
                    targetId={pub?.id ?? g.id}
                    targetType={pub ? "publication" : "graph"}
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
