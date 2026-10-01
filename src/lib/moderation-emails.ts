import { sendEmail } from "./email";
import { type ModerationNotice, moderationEmail } from "./moderation-email-templates";

export async function notifyOwner(to: string, notice: ModerationNotice, reason: string) {
  const replyTo = process.env.MODERATION_REPLY_TO || undefined;
  await sendEmail({ to, ...moderationEmail(notice, reason, replyTo), replyTo });
}
