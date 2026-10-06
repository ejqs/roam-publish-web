import { inArray } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { inboxReply } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin";
import { inboxClient, parseAddress } from "@/lib/inbox";
import { fmtDate, param, STACKED_TABLE } from "../ui";

export const metadata = { title: "Inbox · Admin" };

export default async function AdminInboxPage(props: PageProps<"/admin/inbox">) {
  await requireAdminPage("/admin/inbox");
  const sp = await props.searchParams;
  const after = param(sp.after);
  const before = param(sp.before);
  const res = await inboxClient.list({ after: after || undefined, before: before || undefined });

  if (!res.ok)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Couldn&apos;t load the inbox</EmptyTitle>
          <EmptyDescription>{res.error}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  const { emails, hasMore } = res.data;
  const replied = new Set(
    emails.length
      ? (
          await db
            .selectDistinct({ emailId: inboxReply.emailId })
            .from(inboxReply)
            .where(inArray(inboxReply.emailId, emails.map((e) => e.id)))
        ).map((r) => r.emailId)
      : [],
  );
  // Resend pages newest first: "Newer" goes before the first row, "Older" after the last.
  const paged = !!(after || before);
  const newer = paged && emails.length ? `/admin/inbox?before=${encodeURIComponent(emails[0].id)}` : null;
  const older =
    (before || hasMore) && emails.length ? `/admin/inbox?after=${encodeURIComponent(emails[emails.length - 1].id)}` : null;

  return (
    <div className="flex flex-col gap-4">
      {emails.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No emails</EmptyTitle>
            <EmptyDescription>Emails sent to the domain, such as replies to moderation notices, show up here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table className={STACKED_TABLE}>
          <TableHeader>
            <TableRow>
              <TableHead>Subject</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Received</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {emails.map((e) => {
              const from = parseAddress(e.from);
              return (
                <TableRow key={e.id} className="align-top">
                  <TableCell className="max-w-md">
                    <Link href={`/admin/inbox/${encodeURIComponent(e.id)}`} className="font-medium text-link hover:underline">
                      {e.subject?.trim() || "(no subject)"}
                    </Link>
                    {e.attachments.length > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {e.attachments.length} attachment{e.attachments.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell data-label="From">
                    {from.name ? (
                      <>
                        {from.name} <span className="text-muted-foreground">{from.email}</span>
                      </>
                    ) : (
                      from.email
                    )}
                  </TableCell>
                  <TableCell data-label="To" className="text-muted-foreground">
                    {e.to.join(", ")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(new Date(e.created_at))}</TableCell>
                  <TableCell>{replied.has(e.id) && <Badge variant="secondary">Replied</Badge>}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {(newer || older) && (
        <nav className="flex justify-end gap-1" aria-label="Pagination">
          {newer && (
            <Link href={newer} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Newer
            </Link>
          )}
          {older && (
            <Link href={older} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Older
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
