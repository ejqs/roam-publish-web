"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { inboxReply } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import { inboxClient, quoteText, replyAddress, replySubject, textToHtml } from "@/lib/inbox";
import { withAction } from "@/lib/telemetry";

export type ActionState = { ok: boolean; message: string } | null;

const Input = z.object({
  emailId: z.string().min(1).max(200),
  body: z.string().trim().min(1, "Write a reply first.").max(10_000, "Keep the reply under 10,000 characters."),
});

/**
 * Answers a received email. Who it goes to and its subject come from the email itself, fetched again
 * here, never from the form. It threads under the original in the sender's mail app.
 */
export async function replyToInboxEmail(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return withAction("admin.replyToInboxEmail", async () => {
    const admin = await requireAdmin();
    const parsed = Input.safeParse({ emailId: formData.get("emailId"), body: formData.get("body") ?? "" });
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

    const original = await inboxClient.get(parsed.data.emailId);
    if (!original.ok) return { ok: false, message: `Couldn't load that email: ${original.error}` };
    const e = original.data;
    const to = replyAddress(e);
    const subject = replySubject(e.subject ?? "");
    const text = `${parsed.data.body}\n\n${quoteText(e.text ?? "", e.from, new Date(e.created_at))}`;

    const sent = await sendEmail({
      to,
      subject,
      text,
      html: textToHtml(text),
      replyTo: process.env.MODERATION_REPLY_TO || undefined,
      headers: e.message_id ? { "In-Reply-To": e.message_id, References: e.message_id } : undefined,
    });
    if (!sent) return { ok: false, message: "The reply didn't send. Try again in a moment." };

    await db.insert(inboxReply).values({ emailId: e.id, adminId: admin.user.id, to, subject, body: parsed.data.body });
    revalidatePath("/admin/inbox", "layout");
    return { ok: true, message: `Reply sent to ${to}.` };
  });
}
