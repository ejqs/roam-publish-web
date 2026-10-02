import { and, count, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { graph, publication, report, user } from "@/db/schema";
import { publicationPath } from "@/lib/publications";
import { plainText } from "@/lib/slug";
import { PublicationActions } from "../target-actions";
import { ADMIN_PAGE_SIZE, FilterLinks, fmtDate, Pager, param, parsePage, SearchForm, STACKED_TABLE } from "../ui";

const FILTERS = ["all", "public", "unlisted", "removed", "reported"] as const;
type Filter = (typeof FILTERS)[number];

const openReports = sql<number>`(
  select count(*)::int from ${report}
  where ${report.publicationId} = ${publication.id} and ${report.status} = 'open'
)`;

export default async function AdminPublicationsPage(props: PageProps<"/admin/publications">) {
  const search = await props.searchParams;
  const q = param(search.q);
  const f = param(search.filter);
  const filter: Filter = FILTERS.includes(f as Filter) ? (f as Filter) : "all";
  const page = parsePage(param(search.page));

  const conds: (SQL | undefined)[] = [];
  if (q) conds.push(or(ilike(publication.title, `%${q}%`), ilike(graph.name, `%${q}%`)));
  if (filter === "public") conds.push(eq(publication.visibility, "public"), isNull(publication.removedAt));
  if (filter === "unlisted") conds.push(eq(publication.visibility, "unlisted"), isNull(publication.removedAt));
  if (filter === "removed") conds.push(isNotNull(publication.removedAt));
  if (filter === "reported") conds.push(sql`${openReports} > 0`);
  const where = and(...conds);

  const base = () =>
    db
      .select({
        pub: publication,
        graphName: graph.name,
        email: user.email,
        reports: openReports,
      })
      .from(publication)
      .innerJoin(graph, eq(graph.id, publication.graphId))
      .innerJoin(user, eq(user.id, graph.userId));

  const [[{ total }], rows] = await Promise.all([
    db
      .select({ total: count() })
      .from(publication)
      .innerJoin(graph, eq(graph.id, publication.graphId))
      .where(where),
    base()
      .where(where)
      .orderBy(desc(publication.updatedAt))
      .limit(ADMIN_PAGE_SIZE)
      .offset((page - 1) * ADMIN_PAGE_SIZE),
  ]);
  const keep = { q, filter: filter === "all" ? "" : filter };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchForm path="/admin/publications" q={q} placeholder="Search title or graph" keep={{ filter: keep.filter }} />
        <FilterLinks
          path="/admin/publications"
          name="filter"
          value={filter}
          keep={{ q }}
          options={FILTERS.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))}
        />
      </div>
      <Table className={STACKED_TABLE}>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Graph</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Reports</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ pub, graphName, email, reports }) => (
            <TableRow key={pub.id}>
              <TableCell className="max-w-xs truncate">
                <Link
                  href={publicationPath(graphName, pub.rootUid, pub.title)}
                  target="_blank"
                  className="text-link hover:underline"
                >
                  {plainText(pub.title) || "Untitled"}
                </Link>
              </TableCell>
              <TableCell data-label="Graph">{graphName}</TableCell>
              <TableCell className="text-muted-foreground">{email}</TableCell>
              <TableCell>
                {pub.removedAt ? (
                  <Badge variant="destructive" title={pub.removedReason ?? undefined}>
                    removed
                  </Badge>
                ) : (
                  <Badge variant={pub.visibility === "public" ? "secondary" : "outline"}>{pub.visibility}</Badge>
                )}
              </TableCell>
              <TableCell data-label="Reports">
                {reports > 0 ? <Badge variant="destructive">{reports} open</Badge> : <span className="text-muted-foreground">0</span>}
              </TableCell>
              <TableCell data-label="Updated" className="text-muted-foreground">{fmtDate(pub.updatedAt)}</TableCell>
              <TableCell className="text-right max-sm:text-left">
                <PublicationActions pub={pub} graphName={graphName} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pager path="/admin/publications" params={keep} page={page} total={total} />
    </div>
  );
}
