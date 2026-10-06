/**
 * One look for every email roam.pub sends (the "Roam Publish emails" design). Each message is described
 * once and rendered twice: HTML for mail apps, and the plain text sent alongside it (and printed by the dev
 * fallback). Pure, so the admin moderation dialog can preview it client-side.
 *
 * Mail apps ignore <style> blocks, most CSS and SVG images, so everything is inline, laid out with tables,
 * and the logo is a PNG.
 */

export type EmailBlock =
  | { p: string; danger?: boolean }
  | { list: string[] }
  | { details: { label: string; value: string; href?: string }[] }
  | { section: string; tone: "new" | "ongoing" | "fixed" | "info"; items: string[] };

export type EmailMessage = {
  /** Shown after the subject in the inbox list; hidden in the email itself. */
  preview?: string;
  heading: string;
  blocks: EmailBlock[];
  action?: { label: string; url: string; danger?: boolean };
  /** Small print under a rule at the end of the card. */
  note?: string;
  /** Alerts go to admins, so they skip the public footer. */
  audience?: "user" | "admin";
};

const c = {
  page: "#f6f7f9",
  card: "#ffffff",
  text: "#1c2127",
  muted: "#5f6b7c",
  border: "#dce0e5",
  primary: "#2d72d2",
  danger: "#cd4246",
  link: "#106ba3",
};
const font = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
const mono = `ui-monospace, Menlo, Consolas, monospace`;
const badge = {
  new: { bg: "#f8e3e4", fg: "#ac2f33" },
  ongoing: { bg: "#f8ead9", fg: "#935610" },
  fixed: { bg: "#dcede4", fg: "#1c6e42" },
  info: { bg: "#edeff2", fg: "#404854" },
};

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const siteUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "https://roam.pub").replace(/\/$/, "");

export function renderEmail(m: EmailMessage): { text: string; html: string } {
  return { text: renderText(m), html: renderHtml(m) };
}

function renderText(m: EmailMessage) {
  const parts = [m.heading];
  for (const b of m.blocks) {
    if ("p" in b) parts.push(b.p);
    else if ("list" in b) parts.push(b.list.map((i) => `- ${i}`).join("\n"));
    else if ("details" in b) parts.push(b.details.map((d) => `${d.label}: ${d.href ?? d.value}`).join("\n"));
    else if (b.items.length) parts.push(`${b.section}:\n${b.items.map((i) => `- ${i}`).join("\n")}`);
  }
  if (m.action) parts.push(`${m.action.label}:\n${m.action.url}`);
  if (m.note) parts.push(m.note);
  parts.push(m.audience === "admin" ? "Sent to roam.pub admins." : `Roam Publish · ${siteUrl()}`);
  return parts.join("\n\n");
}

function renderHtml(m: EmailMessage) {
  const e = escapeHtml;
  const block = (b: EmailBlock) => {
    if ("p" in b)
      return `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${b.danger ? c.danger : c.text};${b.danger ? "font-weight:600;" : ""}">${e(b.p)}</p>`;
    if ("list" in b)
      return `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:24px;color:${c.text};">${b.list.map((i) => `<li>${e(i)}</li>`).join("")}</ul>`;
    if ("details" in b)
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:${c.page};border:1px solid ${c.border};border-radius:2px;">
<tr><td style="padding:12px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${b.details
  .map(
    (d) =>
      `<tr><td valign="top" style="width:110px;padding:3px 12px 3px 0;font-size:14px;line-height:20px;color:${c.muted};">${e(d.label)}</td>` +
      `<td valign="top" style="padding:3px 0;font-size:14px;line-height:20px;color:${c.text};word-break:break-word;">${
        d.href
          ? `<a href="${e(d.href)}" target="_blank" style="color:${c.link};">${e(d.value)}</a>`
          : e(d.value)
      }</td></tr>`,
  )
  .join("\n")}
</table>
</td></tr></table>`;
    if (!b.items.length) return "";
    const t = badge[b.tone];
    return `<p style="margin:0 0 6px;"><span style="display:inline-block;background:${t.bg};color:${t.fg};font-size:12px;line-height:16px;font-weight:600;padding:2px 8px;border-radius:5px;">${e(b.section)}</span></p>
<ul style="margin:0 0 16px;padding-left:20px;font-family:${mono};font-size:13px;line-height:21px;color:${c.text};">${b.items.map((i) => `<li style="margin:0 0 2px;">${e(i)}</li>`).join("")}</ul>`;
  };

  const action = m.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 0;">
<tr><td style="border-radius:2px;background:${m.action.danger ? c.danger : c.primary};">
<a href="${e(m.action.url)}" target="_blank" style="display:inline-block;padding:11px 20px;font-family:${font};font-size:15px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;border-radius:2px;">${e(m.action.label)}</a>
</td></tr></table>
<p style="margin:24px 0 0;font-size:13px;line-height:20px;color:${c.muted};">Button not working? Paste this link into your browser:<br><a href="${e(m.action.url)}" target="_blank" style="color:${c.link};word-break:break-all;">${e(m.action.url)}</a></p>`
    : "";

  const note = m.note
    ? `<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid ${c.border};font-size:13px;line-height:20px;color:${c.muted};">${e(m.note)}</p>`
    : "";

  const site = siteUrl();
  const footer =
    m.audience === "admin"
      ? "Sent to roam.pub admins."
      : `<a href="${e(site)}" target="_blank" style="color:${c.muted};">roam.pub</a> publishes pages and blocks from your Roam graph to the web.<br>A third-party service made by @ejqs. Not affiliated with Roam Research.`;
  // Pads the hidden preview so mail apps don't fill the inbox snippet with the email's first lines.
  const preview = m.preview
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${e(m.preview)}${"&#847;&zwnj;&nbsp;".repeat(60)}</div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${e(m.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${c.page};-webkit-text-size-adjust:100%;">
${preview}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.page};">
<tr><td align="center" style="padding:32px 16px 40px;font-family:${font};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 0 16px;">
<a href="${e(site)}" target="_blank" style="text-decoration:none;color:${c.text};font-size:15px;font-weight:600;line-height:18px;"><img src="${e(site)}/email/logo.png" width="40" height="18" alt="" style="display:inline-block;vertical-align:middle;border:0;margin-right:8px;"><span style="vertical-align:middle;">Roam Publish</span></a>
</td></tr>
<tr><td style="background:${c.card};border:1px solid ${c.border};border-radius:2px;padding:32px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:30px;font-weight:600;color:${c.text};">${e(m.heading)}</h1>
${m.blocks.map(block).join("\n")}
${action}
${note}
</td></tr>
<tr><td style="padding:16px 4px 0;font-size:12px;line-height:18px;color:${c.muted};">${footer}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
