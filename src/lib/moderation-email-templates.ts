import * as t from "./email-templates";

export type ModerationNotice =
  | { kind: "page_removed" | "page_restored"; title: string; url: string }
  | { kind: "graph_suspended" | "graph_restored"; graphName: string; url: string }
  | { kind: "collection_suspended" | "collection_restored"; collectionName: string; url: string }
  | { kind: "account_banned" | "account_restored" };

/** The template and values for a notice to the owner. */
export function moderationTemplate(notice: ModerationNotice, reason: string, replyTo?: string): t.TemplateEmail {
  const m = { reason: reason.trim() || undefined, contact: replyTo || undefined };
  switch (notice.kind) {
    case "page_removed":
      return t.email(t.pageRemoved, { ...m, title: notice.title, url: notice.url });
    case "page_restored":
      return t.email(t.pageRestored, { ...m, title: notice.title, url: notice.url });
    case "graph_suspended":
      return t.email(t.graphSuspended, { ...m, name: notice.graphName, url: notice.url });
    case "graph_restored":
      return t.email(t.graphRestored, { ...m, name: notice.graphName, url: notice.url });
    case "collection_suspended":
      return t.email(t.collectionSuspended, { ...m, name: notice.collectionName, url: notice.url });
    case "collection_restored":
      return t.email(t.collectionRestored, { ...m, name: notice.collectionName, url: notice.url });
    case "account_banned":
      return t.email(t.accountBanned, m);
    case "account_restored":
      return t.email(t.accountRestored, m);
  }
}

/** Subject + body for a notice to the owner. Pure, so the admin dialog can preview it client-side. */
export function moderationEmail(notice: ModerationNotice, reason: string, replyTo?: string) {
  return t.renderTemplate(moderationTemplate(notice, reason, replyTo));
}
