import { and, count, desc, eq, ilike, isNotNull, or, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { collection, collectionEntry, report, user } from "@/db/schema";
import { collectionPath } from "@/lib/publications";
import { CollectionActions, UserActions } from "../target-actions";
import { ADMIN_PAGE_SIZE, FilterLinks, fmtDate, Pager, param, parsePage, SearchForm } from "../ui";

const FILTERS = ["all", "suspended", "reported"] as const;
type Filter = (typeof FILTERS)[number];

const entryCount = sql<number>`(select count(*)::int from ${collectionEntry} where ${collectionEntry.collectionId} = ${collection.id})`;
const openReports = sql<number>`(
  select count(*)::int from ${report} where ${report.collectionId} = ${collection.id} and ${report.status} = 'open'
)`;

export default async function AdminCollectionsPage(props: PageProps<"/admin/collections">) {
  const search = await props.searchParams;
  const q = param(search.q);
  const f = param(search.filter);
  const filter: Filter = FILTERS.includes(f as Filter) ? (f as Filter) : "all";
  const page = parsePage(param(search.page));

  const conds: (SQL | undefined)[] = [];
  if (q) conds.push(or(ilike(collection.name, `%${q}%`), ilike(collection.slug, `%${q}%`), ilike(user.email, `%${q}%`)));
  if (filter === "suspended") conds.push(isNotNull(collection.suspendedAt));
  if (filter === "reported") conds.push(sql`${openReports} > 0`);
  const where = and(...conds);

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(collection).innerJoin(user, eq(user.id, collection.ownerId)).where(where),
    db
      .select({ c: collection, owner: user, entries: entryCount, reports: openReports })
      .from(collection)
      .innerJoin(user, eq(user.id, collection.ownerId))
      .where(where)
      .orderBy(desc(openReports), desc(collection.createdAt))
      .limit(ADMIN_PAGE_SIZE)
      .offset((page - 1) * ADMIN_PAGE_SIZE),
  ]);
  const keep = { q, filter: filter === "all" ? "" : filter };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchForm path="/admin/collections" q={q} placeholder="Search collection or owner email" keep={{ filter: keep.filter }} />
        <FilterLinks
          path="/admin/collections"
          name="filter"
          value={filter}
          keep={{ q }}
          options={FILTERS.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))}
        />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Collection</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Pages</TableHead>
            <TableHead>Reports</TableHead>
            <TableHead>Created</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ c, owner, entries, reports }) => (
            <TableRow key={c.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Link href={collectionPath(c.slug)} target="_blank" className="text-link hover:underline">
                    {c.name}
                  </Link>
                  {c.suspendedAt && (
                    <Badge variant="destructive" title={c.suspendedReason ?? undefined}>
                      suspended
                    </Badge>
                  )}
                  {c.indexAccess !== "open" && <Badge variant="outline">{c.indexAccess}</Badge>}
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
              <TableCell>{entries}</TableCell>
              <TableCell>
                {reports > 0 ? <Badge variant="destructive">{reports} open</Badge> : <span className="text-muted-foreground">0</span>}
              </TableCell>
              <TableCell className="text-muted-foreground">{fmtDate(c.createdAt)}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <CollectionActions c={c} />
                  <UserActions owner={owner} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pager path="/admin/collections" params={keep} page={page} total={total} />
    </div>
  );
}
