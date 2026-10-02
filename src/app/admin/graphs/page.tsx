import { and, count, desc, eq, ilike, isNotNull, or, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { graph, publication, report, user } from "@/db/schema";
import { graphPath } from "@/lib/graphs";
import { GraphActions, UserActions } from "../target-actions";
import { ADMIN_PAGE_SIZE, FilterLinks, fmtDate, Pager, param, parsePage, SearchForm, STACKED_TABLE } from "../ui";

const FILTERS = ["all", "suspended", "reported"] as const;
type Filter = (typeof FILTERS)[number];

const pubCount = sql<number>`(select count(*)::int from ${publication} where ${publication.graphId} = ${graph.id})`;
const openReports = sql<number>`(
  select count(*)::int from ${report} where ${report.graphId} = ${graph.id} and ${report.status} = 'open'
)`;

export default async function AdminGraphsPage(props: PageProps<"/admin/graphs">) {
  const search = await props.searchParams;
  const q = param(search.q);
  const f = param(search.filter);
  const filter: Filter = FILTERS.includes(f as Filter) ? (f as Filter) : "all";
  const page = parsePage(param(search.page));

  const conds: (SQL | undefined)[] = [];
  if (q) conds.push(or(ilike(graph.name, `%${q}%`), ilike(user.email, `%${q}%`)));
  if (filter === "suspended") conds.push(isNotNull(graph.suspendedAt));
  if (filter === "reported") conds.push(sql`${openReports} > 0`);
  const where = and(...conds);

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(graph).innerJoin(user, eq(user.id, graph.userId)).where(where),
    db
      .select({ g: graph, owner: user, pubs: pubCount, reports: openReports })
      .from(graph)
      .innerJoin(user, eq(user.id, graph.userId))
      .where(where)
      .orderBy(desc(openReports), desc(graph.createdAt))
      .limit(ADMIN_PAGE_SIZE)
      .offset((page - 1) * ADMIN_PAGE_SIZE),
  ]);
  const keep = { q, filter: filter === "all" ? "" : filter };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchForm path="/admin/graphs" q={q} placeholder="Search graph or owner email" keep={{ filter: keep.filter }} />
        <FilterLinks
          path="/admin/graphs"
          name="filter"
          value={filter}
          keep={{ q }}
          options={FILTERS.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))}
        />
      </div>
      <Table className={STACKED_TABLE}>
        <TableHeader>
          <TableRow>
            <TableHead>Graph</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Pages</TableHead>
            <TableHead>Reports</TableHead>
            <TableHead>Created</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ g, owner, pubs, reports }) => (
            <TableRow key={g.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Link href={graphPath(g.name)} target="_blank" className="text-link hover:underline">
                    {g.name}
                  </Link>
                  {g.suspendedAt && (
                    <Badge variant="destructive" title={g.suspendedReason ?? undefined}>
                      suspended
                    </Badge>
                  )}
                  {!g.frontPage && <Badge variant="outline">no front page</Badge>}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {owner.email}
                {owner.banned && (
                  <Badge variant="destructive" className="ml-2">
                    banned
                  </Badge>
                )}
              </TableCell>
              <TableCell data-label="Pages">
                <Link
                  href={`/admin/publications?q=${encodeURIComponent(g.name)}`}
                  className="text-link hover:underline"
                >
                  {pubs}
                </Link>
              </TableCell>
              <TableCell data-label="Reports">
                {reports > 0 ? <Badge variant="destructive">{reports} open</Badge> : <span className="text-muted-foreground">0</span>}
              </TableCell>
              <TableCell data-label="Created" className="text-muted-foreground">{fmtDate(g.createdAt)}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-2 max-sm:justify-start">
                  <GraphActions g={g} />
                  <UserActions owner={owner} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pager path="/admin/graphs" params={keep} page={page} total={total} />
    </div>
  );
}
