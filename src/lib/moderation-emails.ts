import { sendEmail } from "./email";
import { type ModerationNotice, moderationTemplate } from "./moderation-email-templates";

export async function notifyOwner(to: string, notice: ModerationNotice, reason: string) {
  const replyTo = process.env.MODERATION_REPLY_TO || undefined;
  await sendEmail({ to, replyTo, ...moderationTemplate(notice, reason, replyTo) });
}
