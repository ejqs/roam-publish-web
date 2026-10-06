import type { GetReceivingEmailResponseSuccess, ListReceivingEmail } from "resend";
import { resend } from "./email";
import { escapeHtml } from "./email-layout";
import { timed } from "./telemetry";

/**
 * The admin inbox: every email Resend received for the domain, read straight from Resend's receiving
 * API (nothing is copied into our database; replies sent from it are logged in `inbox_reply`).
 */

export type InboxSummary = ListReceivingEmail;
export type InboxEmail = GetReceivingEmailResponseSuccess;
type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export const INBOX_PAGE_SIZE = 50;
const NOT_CONFIGURED = "Email isn't set up here: RESEND_API_KEY is missing.";

/** Resend's receiving API. Swappable so the tests can stand in for it. */
export const inboxClient = {
  async list(cursor: { after?: string; before?: string }): Promise<Result<{ emails: InboxSummary[]; hasMore: boolean }>> {
    const c = resend;
    if (!c) return { ok: false, error: NOT_CONFIGURED };
    const page = cursor.before
      ? { limit: INBOX_PAGE_SIZE, before: cursor.before }
      : { limit: INBOX_PAGE_SIZE, ...(cursor.after ? { after: cursor.after } : {}) };
    const r = await timed("resend", () => c.emails.receiving.list(page), (r) => r.error?.message);
    return r.data ? { ok: true, data: { emails: r.data.data, hasMore: r.data.has_more } } : { ok: false, error: r.error.message };
  },
  async get(id: string): Promise<Result<InboxEmail>> {
    const c = resend;
    if (!c) return { ok: false, error: NOT_CONFIGURED };
    const r = await timed("resend", () => c.emails.receiving.get(id), (r) => r.error?.message);
    return r.data ? { ok: true, data: r.data } : { ok: false, error: r.error?.message ?? "Not found" };
  },
  /** A short-lived signed download link. */
  async attachmentUrl(emailId: string, id: string): Promise<Result<string>> {
    const c = resend;
    if (!c) return { ok: false, error: NOT_CONFIGURED };
    const r = await timed(
      "resend",
      () => c.emails.receiving.attachments.get({ emailId, id }),
      (r) => r.error?.message,
    );
    return r.data ? { ok: true, data: r.data.download_url } : { ok: false, error: r.error?.message ?? "Not found" };
  },
};

/** `Ann <ann@example.com>` → name and address; a bare address has no name. */
export function parseAddress(raw: string): { name: string; email: string } {
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  return { name: "", email: raw.trim().toLowerCase() };
}

export const replySubject = (subject: string) => (/^\s*re:/i.test(subject) ? subject.trim() : `Re: ${subject.trim()}`);

/** Where a reply goes: the sender's Reply-To if they set one, else the sender. */
export const replyAddress = (e: Pick<InboxEmail, "from" | "reply_to">) => e.reply_to?.[0] || e.from;

/** The original, quoted under a reply the way mail apps do. */
export function quoteText(text: string, from: string, at: Date) {
  const when = at.toUTCString().replace(" GMT", " UTC");
  return `On ${when}, ${from} wrote:\n${text
    .trimEnd()
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n")}`;
}

/**
 * The document for the iframe that shows an email's HTML. The iframe is sandboxed with no permissions
 * (no scripts, its own empty origin); this policy also keeps it from loading anything remote, such as
 * tracking pixels. Inline images arrive from Resend as data: URIs, so they still show.
 */
export function emailFrameDoc(html: string) {
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:">` +
    `<base target="_blank"><style>body{margin:16px;font-family:system-ui,sans-serif;font-size:14px;color:#1c2127;background:#fff}</style>` +
    `</head><body>${html}</body></html>`
  );
}

/** The HTML part of a reply: the plain text, escaped, line breaks kept. */
export const textToHtml = (text: string) =>
  `<div style="font-family:system-ui,sans-serif;font-size:14px;line-height:20px;white-space:pre-wrap;">${escapeHtml(text)}</div>`;
