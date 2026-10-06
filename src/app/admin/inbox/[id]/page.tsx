import { asc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { db } from "@/db";
import { inboxReply, user } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin";
import { emailFrameDoc, inboxClient, parseAddress, replyAddress } from "@/lib/inbox";
import { fmtDate, param } from "../../ui";
import { ReplyForm } from "./reply-form";

export const metadata = { title: "Email · Admin" };

const size = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export default async function AdminInboxEmailPage(props: PageProps<"/admin/inbox/[id]">) {
  await requireAdminPage("/admin/inbox");
  const { id } = await props.params;
  const view = param((await props.searchParams).view) === "html" ? "html" : "text";
  const res = await inboxClient.get(id);
  if (!res.ok) {
    if (/not.?found/i.test(res.error)) notFound();
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Couldn&apos;t load this email</EmptyTitle>
          <EmptyDescription>{res.error}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  const e = res.data;
  const from = parseAddress(e.from);
  const [account, replies] = await Promise.all([
    db.query.user.findFirst({ where: eq(sql`lower(${user.email})`, from.email), columns: { email: true, name: true } }),
    db
      .select({ r: inboxReply, adminEmail: user.email })
      .from(inboxReply)
      .leftJoin(user, eq(user.id, inboxReply.adminId))
      .where(eq(inboxReply.emailId, e.id))
      .orderBy(asc(inboxReply.createdAt)),
  ]);
  const files = e.attachments.filter((a) => a.content_disposition !== "inline");
  const base = `/admin/inbox/${encodeURIComponent(e.id)}`;
  const rows: [string, React.ReactNode][] = [
    [
      "From",
      <>
        {e.from}
        {account ? (
          <Link href={`/admin/users?q=${encodeURIComponent(account.email)}`} className="ml-2 text-link hover:underline">
            Account: {account.name || account.email}
          </Link>
        ) : (
          <span className="ml-2 text-muted-foreground">No account with this email</span>
        )}
      </>,
    ],
    ["To", e.to.join(", ")],
    ...(e.cc?.length ? [["Cc", e.cc.join(", ")] as [string, string]] : []),
    ...(e.reply_to?.length ? [["Reply-To", e.reply_to.join(", ")] as [string, string]] : []),
    ["Received", fmtDate(new Date(e.created_at))],
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link href="/admin/inbox" className="text-sm text-link hover:underline">
        ← Inbox
      </Link>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold break-words">{e.subject?.trim() || "(no subject)"}</h2>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        {e.html && (
          <div className="flex gap-1">
            <Link
              href={base}
              aria-current={view === "text" ? "true" : undefined}
              className={buttonVariants({ variant: view === "text" ? "secondary" : "ghost", size: "sm" })}
            >
              Plain text
            </Link>
            <Link
              href={`${base}?view=html`}
              aria-current={view === "html" ? "true" : undefined}
              className={buttonVariants({ variant: view === "html" ? "secondary" : "ghost", size: "sm" })}
            >
              Formatted
            </Link>
          </div>
        )}
        {view === "html" && e.html ? (
          <>
            {/* No sandbox permissions: nothing in the email runs, and emailFrameDoc blocks remote loads. */}
            <iframe
              title="Email"
              sandbox=""
              srcDoc={emailFrameDoc(e.html)}
              className="h-[600px] w-full rounded-sm border bg-white"
            />
            <p className="text-xs text-muted-foreground">Remote images and scripts are blocked.</p>
          </>
        ) : (
          <div className="rounded-sm border bg-card p-4 text-sm whitespace-pre-wrap break-words">
            {e.text?.trim() || <span className="text-muted-foreground">No plain-text version. Open Formatted.</span>}
          </div>
        )}
        {files.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {files.map((a) => (
              <li key={a.id}>
                <a href={`${base}/attachments/${encodeURIComponent(a.id)}`} className="text-link hover:underline">
                  {a.filename || "attachment"}
                </a>{" "}
                <span className="text-muted-foreground">
                  {a.content_type}, {size(a.size)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {replies.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="font-semibold">Replies</h3>
          {replies.map(({ r, adminEmail }) => (
            <div key={r.id} className="flex flex-col gap-1 rounded-sm border bg-card p-4 text-sm">
              <p className="text-muted-foreground">
                {adminEmail ?? "An admin"} to {r.to} · {fmtDate(r.createdAt)}
              </p>
              <p className="whitespace-pre-wrap break-words">{r.body}</p>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="font-semibold">Reply to {replyAddress(e)}</h3>
        <ReplyForm emailId={e.id} />
      </section>
    </div>
  );
}
