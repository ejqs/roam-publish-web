import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export async function sendEmail({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}) {
  if (!resend) {
    console.log(`\n[email] to=${to} subject=${subject}\n${text}\n`);
    return;
  }
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Roam Publish <onboarding@resend.dev>",
    to,
    subject,
    text,
  });
  if (error) console.error("[email] send failed", error);
}
