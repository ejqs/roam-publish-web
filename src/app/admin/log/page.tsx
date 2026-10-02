import { count, desc, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { moderationAction, user } from "@/db/schema";
import { ADMIN_PAGE_SIZE, fmtDate, Pager, param, parsePage, STACKED_TABLE } from "../ui";

export default async function AdminLogPage(props: PageProps<"/admin/log">) {
  const page = parsePage(param((await props.searchParams).page));
  const [[{ total }], rows] = await Promise.all([
    db.select({ total: count() }).from(moderationAction),
    db
      .select({ a: moderationAction, adminEmail: user.email })
      .from(moderationAction)
      .leftJoin(user, eq(user.id, moderationAction.adminId))
      .orderBy(desc(moderationAction.createdAt))
      .limit(ADMIN_PAGE_SIZE)
      .offset((page - 1) * ADMIN_PAGE_SIZE),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Table className={STACKED_TABLE}>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Admin</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Emailed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(({ a, adminEmail }) => (
            <TableRow key={a.id} className="align-top">
              <TableCell className="text-muted-foreground">{fmtDate(a.createdAt)}</TableCell>
              <TableCell>{adminEmail ?? "—"}</TableCell>
              <TableCell>
                <Badge variant="outline">{a.action.replace("_", " ")}</Badge>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {a.targetType}:{a.targetId.slice(0, 8)}
              </TableCell>
              <TableCell className="max-w-md whitespace-pre-wrap break-words">{a.reason || "—"}</TableCell>
              <TableCell data-label="Emailed">{a.emailed ? "yes" : "no"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pager path="/admin/log" params={{}} page={page} total={total} />
    </div>
  );
}
