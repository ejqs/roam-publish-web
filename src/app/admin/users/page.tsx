import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { graph, profile, user, usernameAlias } from "@/db/schema";
import { isAdmin } from "@/lib/admin";
import { UserActions } from "../target-actions";
import { ADMIN_PAGE_SIZE, FilterLinks, fmtDate, Pager, param, parsePage, SearchForm, STACKED_TABLE } from "../ui";
import { FormerUsernames, UsernameControls } from "./username-controls";

const FILTERS = ["all", "banned", "unverified"] as const;
type Filter = (typeof FILTERS)[number];

const graphCount = sql<number>`(select count(*)::int from ${graph} where ${graph.userId} = ${user.id})`;

export default async function AdminUsersPage(props: PageProps<"/admin/users">) {
  const search = await props.searchParams;
  const q = param(search.q);
  const f = param(search.filter);
  const filter: Filter = FILTERS.includes(f as Filter) ? (f as Filter) : "all";
  const page = parsePage(param(search.page));

  const conds: (SQL | undefined)[] = [];
  if (q)
    conds.push(
      or(ilike(user.email, `%${q}%`), ilike(user.name, `%${q}%`), ilike(profile.username, `%${q}%`)),
    );
  if (filter === "banned") conds.push(eq(user.banned, true));
  if (filter === "unverified") conds.push(eq(user.emailVerified, false));
  const where = and(...conds);

  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(user).leftJoin(profile, eq(profile.userId, user.id)).where(where),
    db
      .select({ u: user, p: profile, graphs: graphCount })
      .from(user)
      .leftJoin(profile, eq(profile.userId, user.id))
      .where(where)
      .orderBy(desc(user.createdAt))
      .limit(ADMIN_PAGE_SIZE)
      .offset((page - 1) * ADMIN_PAGE_SIZE),
  ]);

  const aliases = rows.length
    ? await db
        .select()
        .from(usernameAlias)
        .where(inArray(usernameAlias.userId, rows.map((r) => r.u.id)))
        .orderBy(usernameAlias.createdAt)
    : [];
  const formerNames = new Map<string, string[]>();
  for (const a of aliases) formerNames.set(a.userId, [...(formerNames.get(a.userId) ?? []), a.username]);
  const keep = { q, filter: filter === "all" ? "" : filter };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchForm path="/admin/users" q={q} placeholder="Search email, name or username" keep={{ filter: keep.filter }} />
        <FilterLinks
          path="/admin/users"
          name="filter"
          value={filter}
          keep={{ q }}
          options={FILTERS.map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))}
        />
      </div>
      <Table className={STACKED_TABLE}>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Username</TableHead>
            <TableHead>Graphs</TableHead>
            <TableHead>Joined</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ u, p, graphs }) => {
            const former = formerNames.get(u.id) ?? [];
            return (
              <TableRow key={u.id} className="align-top">
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span>{u.email}</span>
                    {isAdmin(u) && <Badge variant="secondary">admin</Badge>}
                    {!u.emailVerified && <Badge variant="outline">unverified</Badge>}
                    {u.banned && (
                      <Badge variant="destructive" title={u.banReason ?? undefined}>
                        banned
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{u.name}</div>
                </TableCell>
                <TableCell className="max-sm:w-full">
                  {p ? (
                    <div className="flex items-center gap-1.5">
                      <Link href={`/u/${p.username}`} target="_blank" className="text-link hover:underline">
                        @{p.username}
                      </Link>
                      <Badge variant="outline">{p.isPublic ? "public" : "private"}</Badge>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  {former.length > 0 && <FormerUsernames names={former} />}
                  {p && <UsernameControls userId={u.id} username={p.username} />}
                </TableCell>
                <TableCell data-label="Graphs">
                  <Link href={`/admin/graphs?q=${encodeURIComponent(u.email)}`} className="text-link hover:underline">
                    {graphs}
                  </Link>
                </TableCell>
                <TableCell data-label="Joined" className="text-muted-foreground">{fmtDate(u.createdAt)}</TableCell>
                <TableCell className="text-right max-sm:text-left">
                  {!isAdmin(u) && <UserActions owner={u} />}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Pager path="/admin/users" params={keep} page={page} total={total} />
    </div>
  );
}
