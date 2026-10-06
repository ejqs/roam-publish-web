import { createHash } from "node:crypto";
import { Resend } from "resend";
import { escapeHtml, renderEmail } from "./email-layout";
import { renderTemplate, type TemplateEmail } from "./email-templates";
import { timed } from "./telemetry";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const from = () => process.env.EMAIL_FROM ?? "Roam Publish <onboarding@resend.dev>";

type Content = TemplateEmail | { subject: string; text: string; html?: string };

/**
 * Sends an email: a Resend template from lib/email-templates.ts (`template` + `values`), or a one-off
 * `subject` + `text` (+ `html`, see lib/email-layout.ts). Without RESEND_API_KEY it's printed instead,
 * outside production only: these emails carry sign-in, reset and delete links, which mustn't end up in
 * the host's logs. The tests set EMAIL_CONSOLE=on to read them, since staging's pre-deploy runs them
 * with NODE_ENV=production.
 */
export async function sendEmail(email: { to: string; replyTo?: string } & Content) {
  const { to, replyTo } = email;
  const inline = "template" in email ? renderTemplate(email) : email;
  if (!resend) {
    if (process.env.NODE_ENV === "production" && process.env.EMAIL_CONSOLE !== "on") {
      console.error(`[email] not sent, RESEND_API_KEY is not set: ${inline.subject}`);
      return false;
    }
    console.log(`\n[email] to=${to} subject=${inline.subject}\n${inline.text}\n`);
    return true;
  }

  if ("template" in email) {
    const hosted = hostedTemplate(email);
    if (await ensureTemplate(hosted)) {
      const { error } = await timed(
        "resend",
        () =>
          resend.emails.send({ from: from(), to, replyTo, template: { id: hosted.alias, variables: hosted.variables } }),
        (r) => r.error?.message,
      );
      if (!error) return true;
      console.error("[email] template send failed, sending without it", hosted.alias, error);
    }
  }
  // One-off emails, and the fallback when Resend's templates fail, so a sign-in link still goes out.
  const { error } = await timed(
    "resend",
    () => resend.emails.send({ from: from(), to, subject: inline.subject, text: inline.text, html: inline.html, replyTo }),
    (r) => r.error?.message,
  );
  if (error) console.error("[email] send failed", error);
  return !error;
}

// Resend templates

/** `graphName` → `GRAPH_NAME`. Resend reserves EMAIL, FIRST_NAME and the like, so templates avoid those keys. */
const varName = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();

/**
 * The Resend copy of a template for these values: the HTML takes `{{{VAR}}}`, which Resend inserts as
 * is, so the values sent for it are escaped here; the subject and text take the raw `{{{VAR_PLAIN}}}`.
 * The alias carries a hash of the content, so a changed template, or one missing an optional value, is a
 * new Resend template, and staging and production never overwrite each other's.
 */
export function hostedTemplate({ template, values }: TemplateEmail) {
  const present = Object.keys(values).filter((k) => values[k] !== undefined && values[k] !== "");
  const holes = (suffix: string) =>
    Object.fromEntries(present.map((k) => [k, `{{{${varName(k)}${suffix}}}}`]));
  const html = renderEmail(template.message(holes(""))).html;
  const text = renderEmail(template.message(holes("_PLAIN"))).text;
  const subject = template.subject(holes("_PLAIN"));
  const hash = createHash("sha256").update(`${subject}\0${html}\0${text}`).digest("hex").slice(0, 12);
  return {
    alias: `rp-${template.key}-${hash}`,
    name: `Roam Publish: ${template.key}`,
    subject,
    html,
    text,
    keys: present.flatMap((k) => [varName(k), `${varName(k)}_PLAIN`]),
    variables: Object.fromEntries(
      present.flatMap((k) => [
        [varName(k), escapeHtml(values[k]!)],
        [`${varName(k)}_PLAIN`, values[k]!],
      ]),
    ),
  };
}

const ready = new Map<string, Promise<boolean>>();

/** Makes sure Resend has this template published, once per process. */
function ensureTemplate(t: ReturnType<typeof hostedTemplate>) {
  let p = ready.get(t.alias);
  if (!p) {
    p = publishTemplate(t);
    ready.set(t.alias, p);
    // Try again on the next email rather than giving up until a restart.
    void p.then((ok) => ok || ready.delete(t.alias));
  }
  return p;
}

async function publishTemplate(t: ReturnType<typeof hostedTemplate>) {
  if (!resend) return false;
  try {
    const existing = await resend.templates.get(t.alias);
    if (existing.data) {
      if (existing.data.status === "published") return true;
      return !(await resend.templates.publish(existing.data.id)).error;
    }
    const created = await resend.templates.create({
      name: t.name,
      alias: t.alias,
      subject: t.subject,
      html: t.html,
      text: t.text,
      variables: t.keys.map((key) => ({ key, type: "string" as const })),
    });
    if (!created.data) {
      console.error("[email] couldn't create template", t.alias, created.error);
      return false;
    }
    const published = await resend.templates.publish(created.data.id);
    if (published.error) console.error("[email] couldn't publish template", t.alias, published.error);
    return !published.error;
  } catch (e) {
    console.error("[email] template setup failed", t.alias, e);
    return false;
  }
}
