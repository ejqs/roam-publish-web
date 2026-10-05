import { Resend } from "resend";
import { timed } from "./telemetry";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/**
 * Sends an email. Without RESEND_API_KEY it's printed instead, outside production only: these emails
 * carry sign-in, reset and delete links, which mustn't end up in the host's logs.
 */
export async function sendEmail({
  to,
  subject,
  text,
  replyTo,
}: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}) {
  if (!resend) {
    if (process.env.NODE_ENV === "production") {
      console.error(`[email] not sent, RESEND_API_KEY is not set: ${subject}`);
      return false;
    }
    console.log(`\n[email] to=${to} subject=${subject}\n${text}\n`);
    return true;
  }
  const { error } = await timed(
    "resend",
    () =>
      resend.emails.send({
        from: process.env.EMAIL_FROM ?? "Roam Publish <onboarding@resend.dev>",
        to,
        subject,
        text,
        replyTo,
      }),
    (r) => r.error?.message,
  );
  if (error) console.error("[email] send failed", error);
  return !error;
}
