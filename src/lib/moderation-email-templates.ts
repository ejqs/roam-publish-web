export type ModerationNotice =
  | { kind: "page_removed" | "page_restored"; title: string; url: string }
  | { kind: "graph_suspended" | "graph_restored"; graphName: string; url: string }
  | { kind: "collection_suspended" | "collection_restored"; collectionName: string; url: string }
  | { kind: "account_banned" | "account_restored" };

function contactLine(to?: string) {
  return to
    ? `If you think this was a mistake, reply to this email or write to ${to}.`
    : "If you think this was a mistake, contact the roam.pub team.";
}

/** Subject + body for a notice to the owner. Pure, so the admin dialog can preview it client-side. */
export function moderationEmail(notice: ModerationNotice, reason: string, replyTo?: string) {
  const why = reason.trim() ? `\n\nReason: ${reason.trim()}` : "";
  switch (notice.kind) {
    case "page_removed":
      return {
        subject: `Your page "${notice.title}" was removed from roam.pub`,
        text:
          `A roam.pub moderator removed your published page "${notice.title}" (${notice.url}).${why}\n\n` +
          `The page is no longer visible to anyone, and it can't be republished from Roam. ` +
          `Your other pages are not affected.\n\n${contactLine(replyTo)}`,
      };
    case "page_restored":
      return {
        subject: `Your page "${notice.title}" is back on roam.pub`,
        text:
          `A roam.pub moderator restored your page "${notice.title}". It's visible again at ${notice.url} ` +
          `and you can republish it from Roam as usual.${why}`,
      };
    case "graph_suspended":
      return {
        subject: `Your graph "${notice.graphName}" was suspended on roam.pub`,
        text:
          `A roam.pub moderator suspended your graph "${notice.graphName}" (${notice.url}).${why}\n\n` +
          `All of its published pages are hidden, and publishing from this graph is turned off.\n\n` +
          contactLine(replyTo),
      };
    case "graph_restored":
      return {
        subject: `Your graph "${notice.graphName}" is back on roam.pub`,
        text:
          `A roam.pub moderator lifted the suspension on "${notice.graphName}". Its pages are visible ` +
          `again at ${notice.url} and you can publish from Roam as usual.${why}`,
      };
    case "collection_suspended":
      return {
        subject: `Your collection "${notice.collectionName}" was suspended on roam.pub`,
        text:
          `A roam.pub moderator suspended your collection "${notice.collectionName}" (${notice.url}).${why}\n\n` +
          `The collection and its pages are hidden there. The pages stay in their own graphs.\n\n` +
          contactLine(replyTo),
      };
    case "collection_restored":
      return {
        subject: `Your collection "${notice.collectionName}" is back on roam.pub`,
        text:
          `A roam.pub moderator lifted the suspension on "${notice.collectionName}". It's visible again at ` +
          `${notice.url}.${why}`,
      };
    case "account_banned":
      return {
        subject: "Your roam.pub account was suspended",
        text:
          `A roam.pub moderator suspended your account.${why}\n\n` +
          `You've been signed out, your graphs and pages are hidden, and the Roam extension can no ` +
          `longer publish.\n\n${contactLine(replyTo)}`,
      };
    case "account_restored":
      return {
        subject: "Your roam.pub account is active again",
        text:
          `A roam.pub moderator restored your account. You can sign in and publish again, and your ` +
          `pages are visible as before.${why}`,
      };
  }
}
