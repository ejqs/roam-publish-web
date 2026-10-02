import { and, count, desc, eq, ilike, notExists } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { blockedIdentity, collection, cPath } from "@/db/schema";
import { emailHash } from "@/lib/deletion";
import { adminLiftBlock, adminReleaseCollectionSlug } from "../actions";
import { ADMIN_PAGE_SIZE, fmtDate, Pager, param, parsePage, SearchForm, STACKED_TABLE } from "../ui";
import { LiftButton } from "./lift-button";

/**
 * What deleted accounts left blocked because a moderator had acted on them (src/lib/deletion.ts).
 * Search by email (matched by hash), graph name or username.
 */
export default async function AdminBlockedPage(props: PageProps<"/admin/blocked">) {
  const sp = await props.searchParams;
  const q = param(sp.q);
  const page = parsePage(param(sp.page));
  const where = !q
    ? undefined
    : q.includes("@")
      ? and(eq(blockedIdentity.kind, "email"), eq(blockedIdentity.value, emailHash(q)))
      : ilike(blockedIdentity.value, `%${q.toLowerCase().replace(/[%_\\]/g, "\\$&")}%`);
  const orphanSlug = and(
    eq(cPath.kind, "collection"),
    notExists(db.select({ id: collection.id }).from(collection).where(eq(collection.slug, cPath.path))),
  );
  const [[{ total }], rows, slugs] = await Promise.all([
    db.select({ total: count() }).from(blockedIdentity).where(where),
    db
      .select()
      .from(blockedIdentity)
      .where(where)
      .orderBy(desc(blockedIdentity.createdAt), blockedIdentity.kind)
      .limit(ADMIN_PAGE_SIZE)
      .offset((page - 1) * ADMIN_PAGE_SIZE),
    db.select().from(cPath).where(orphanSlug).orderBy(desc(cPath.createdAt)).limit(200),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          When an account is deleted while a moderator had acted on it, its email can&apos;t sign up, its graphs
          can&apos;t be connected and its usernames can&apos;t be claimed. Lift an entry to allow it again.
        </p>
        <SearchForm path="/admin/blocked" q={q} placeholder="Email, graph name or username" />
        {q.includes("@") && (
          <p className="text-sm text-muted-foreground">
            {total ? "This email is blocked." : "This email isn't blocked."}
          </p>
        )}
      </div>
      <Table className={STACKED_TABLE}>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Value</TableHead>
            <TableHead>Why</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-muted-foreground">
                Nothing blocked.
              </TableCell>
            </TableRow>
          )}
          {rows.map((b) => (
            <TableRow key={`${b.kind}:${b.value}`} className="align-top">
              <TableCell className="text-muted-foreground">{fmtDate(b.createdAt)}</TableCell>
              <TableCell>
                <Badge variant="outline">{b.kind}</Badge>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {b.kind === "email" ? `${b.value.slice(0, 12)}… (hash)` : b.value}
              </TableCell>
              <TableCell className="max-w-md whitespace-pre-wrap break-words">{b.reason || "—"}</TableCell>
              <TableCell>
                <div className="flex flex-wrap justify-end gap-2 max-sm:justify-start">
                  <LiftButton
                    label="Lift"
                    confirmText={`Lift this ${b.kind} block?`}
                    action={adminLiftBlock.bind(null, { kind: b.kind, value: b.value })}
                  />
                  {b.moderationActionId && (
                    <LiftButton
                      label="Lift all from this account"
                      confirmText="Lift every block this deleted account left?"
                      action={adminLiftBlock.bind(null, { kind: "all", moderationActionId: b.moderationActionId })}
                    />
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pager path="/admin/blocked" params={{ q }} page={page} total={total} />

      <div className="flex flex-col gap-2">
        <h2 className="font-semibold">Reserved collection slugs</h2>
        <p className="text-sm text-muted-foreground">
          Slugs of suspended collections whose owner deleted their account. Release one to let anyone create a
          collection with it.
        </p>
        <Table className={STACKED_TABLE}>
          <TableBody>
            {slugs.length === 0 && (
              <TableRow>
                <TableCell className="text-muted-foreground">None.</TableCell>
              </TableRow>
            )}
            {slugs.map((s) => (
              <TableRow key={s.path}>
                <TableCell className="text-muted-foreground">{fmtDate(s.createdAt)}</TableCell>
                <TableCell className="font-mono text-xs">/c/{s.path}</TableCell>
                <TableCell className="text-right max-sm:text-left">
                  <LiftButton
                    label="Release"
                    confirmText={`Release /c/${s.path}?`}
                    action={adminReleaseCollectionSlug.bind(null, s.path)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
