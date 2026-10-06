import { type EmailMessage, renderEmail } from "./email-layout";

/**
 * Every email users get, as a Resend template. lib/email.ts publishes each one to Resend the first time
 * it's sent and from then on sends only its alias and values; renderTemplate fills it in here for the
 * dev console, the tests and the moderation dialog's preview.
 *
 * `message` and `subject` are called with real values, and also with Resend's `{{{VAR}}}` placeholders
 * to build the hosted copy, so they may only place values, never inspect them. An optional value that's
 * missing gets its own hosted copy without it.
 */

type Values = Record<string, string | undefined>;

export type EmailTemplate<V extends Values = Values> = {
  /** Start of the Resend alias; lib/email.ts adds a hash of the content. */
  key: string;
  subject: (v: V) => string;
  message: (v: V) => EmailMessage;
};

export type TemplateEmail = { template: EmailTemplate; values: Values };

const define = <V extends Values>(t: EmailTemplate<V>) => t;
/** Pairs a template with its values, checking them against it. */
export const email = <V extends Values>(template: EmailTemplate<V>, values: V): TemplateEmail => ({
  template: template as unknown as EmailTemplate,
  values,
});

export function renderTemplate({ template, values }: TemplateEmail) {
  return { subject: template.subject(values), ...renderEmail(template.message(values)) };
}

// Account

export const verifyEmail = define<{ address: string; url: string }>({
  key: "verify-email",
  subject: () => "Verify your Roam Publish email",
  message: (v) => ({
    preview: "Confirm your email to start publishing.",
    heading: "Verify your email",
    blocks: [{ p: `Confirm that ${v.address} is yours to finish logging in to Roam Publish.` }],
    action: { label: "Verify email", url: v.url },
    note: "If you didn't sign up for Roam Publish, ignore this email.",
  }),
});

export const resetPassword = define<{ address: string; url: string }>({
  key: "reset-password",
  subject: () => "Reset your Roam Publish password",
  message: (v) => ({
    preview: "Choose a new password for your account.",
    heading: "Reset your password",
    blocks: [{ p: `Someone asked to reset the password for ${v.address}. Choose a new one with the button below.` }],
    action: { label: "Reset password", url: v.url },
    note: "If you didn't ask for this, ignore this email. Your password stays the same.",
  }),
});

export const deleteAccount = define<{ address: string; url: string }>({
  key: "delete-account",
  subject: () => "Confirm deleting your Roam Publish account",
  message: (v) => ({
    preview: "This permanently deletes your account and everything you published.",
    heading: "Delete your account?",
    blocks: [
      { p: `Open this link while logged in to permanently delete ${v.address} and everything in it:` },
      { list: ["your account", "your graphs and their published pages", "your collections"] },
      { p: "This can't be undone.", danger: true },
    ],
    action: { label: "Delete my account", url: v.url, danger: true },
    note: "If you didn't ask for this, ignore this email and nothing will be deleted.",
  }),
});

// Sharing. `type` is "graph" or "collection", `typeLabel` the same capitalized.

type Target = { type: string; typeLabel: string; name: string };

export const invite = define<Target & { url: string; days: string }>({
  key: "invite",
  subject: (v) => `You've been invited to the ${v.type} ${v.name} on Roam Publish`,
  message: (v) => ({
    preview: "Nothing changes until you accept.",
    heading: `You're invited to publish to ${v.name}`,
    blocks: [
      { p: `The owner of the ${v.type} ${v.name} invited you to publish to it. Nothing changes until you accept.` },
      {
        details: [
          { label: v.typeLabel, value: v.name },
          { label: "Role", value: "Member" },
          { label: "Expires", value: `in ${v.days} days` },
        ],
      },
    ],
    action: { label: "Review invite", url: v.url },
    note: "Not expecting this? Leave it and the invite expires on its own.",
  }),
});

export const transferOffer = define<Target & { url: string; days: string }>({
  key: "transfer-offer",
  subject: (v) => `You've been offered ownership of the ${v.type} ${v.name} on Roam Publish`,
  message: (v) => ({
    preview: "Nothing changes until you accept.",
    heading: `Take over ${v.name}?`,
    blocks: [
      { p: `The owner of the ${v.type} ${v.name} wants to make you its owner. They will stay on as a member.` },
      {
        details: [
          { label: v.typeLabel, value: v.name },
          { label: "Role", value: "Owner" },
          { label: "Expires", value: `in ${v.days} days` },
        ],
      },
    ],
    action: { label: "Review transfer", url: v.url },
    note: "Nothing changes until you accept. Leave it and the offer expires on its own.",
  }),
});

export const transferDoneOldOwner = define<Target & { newOwner: string }>({
  key: "transfer-done-old-owner",
  subject: (v) => `Ownership of the ${v.type} ${v.name} was transferred`,
  message: (v) => ({
    preview: "You're now a member.",
    heading: `${v.name} has a new owner`,
    blocks: [{ p: `${v.newOwner} accepted ownership of the ${v.type} ${v.name}. You're now a member.` }],
  }),
});

export const transferDoneNewOwner = define<Target & { url: string }>({
  key: "transfer-done-new-owner",
  subject: (v) => `You now own the ${v.type} ${v.name}`,
  message: (v) => ({
    preview: "You can manage it from your dashboard.",
    heading: `You now own ${v.name}`,
    blocks: [{ p: `You accepted ownership of the ${v.type} ${v.name} on Roam Publish.` }],
    action: { label: "Open dashboard", url: v.url },
  }),
});

// Moderation. `reason` and `contact` (the reply-to address) are optional.

type Moderation = { reason?: string; contact?: string };

const contactNote = (v: Moderation) =>
  v.contact
    ? `If you think this was a mistake, reply to this email or write to ${v.contact}.`
    : "If you think this was a mistake, contact the roam.pub team.";
const reasonRow = (v: Moderation) => (v.reason ? [{ label: "Reason", value: v.reason }] : []);
const details = (rows: { label: string; value: string; href?: string }[]) => ({ details: rows });

export const pageRemoved = define<Moderation & { title: string; url: string }>({
  key: "page-removed",
  subject: (v) => `Your page "${v.title}" was removed from roam.pub`,
  message: (v) => ({
    preview: "A moderator removed one of your published pages.",
    heading: "Your page was removed",
    blocks: [
      { p: `A roam.pub moderator removed your published page "${v.title}".` },
      details([{ label: "Page", value: v.url, href: v.url }, ...reasonRow(v)]),
      { p: "The page is no longer visible to anyone, and it can't be republished from Roam. Your other pages are not affected." },
    ],
    note: contactNote(v),
  }),
});

export const pageRestored = define<Moderation & { title: string; url: string }>({
  key: "page-restored",
  subject: (v) => `Your page "${v.title}" is back on roam.pub`,
  message: (v) => ({
    preview: "It's visible again and you can republish it from Roam.",
    heading: "Your page is back",
    blocks: [
      { p: `A roam.pub moderator restored your page "${v.title}". It's visible again and you can republish it from Roam as usual.` },
      ...(v.reason ? [details(reasonRow(v))] : []),
    ],
    action: { label: "View page", url: v.url },
  }),
});

export const graphSuspended = define<Moderation & { name: string; url: string }>({
  key: "graph-suspended",
  subject: (v) => `Your graph "${v.name}" was suspended on roam.pub`,
  message: (v) => ({
    preview: "Its pages are hidden and publishing from it is turned off.",
    heading: "Your graph was suspended",
    blocks: [
      { p: `A roam.pub moderator suspended your graph "${v.name}".` },
      details([{ label: "Graph", value: v.url, href: v.url }, ...reasonRow(v)]),
      { p: "All of its published pages are hidden, and publishing from this graph is turned off." },
    ],
    note: contactNote(v),
  }),
});

export const graphRestored = define<Moderation & { name: string; url: string }>({
  key: "graph-restored",
  subject: (v) => `Your graph "${v.name}" is back on roam.pub`,
  message: (v) => ({
    preview: "Its pages are visible again and you can publish as usual.",
    heading: "Your graph is back",
    blocks: [
      { p: `A roam.pub moderator lifted the suspension on "${v.name}". Its pages are visible again and you can publish from Roam as usual.` },
      ...(v.reason ? [details(reasonRow(v))] : []),
    ],
    action: { label: "View graph", url: v.url },
  }),
});

export const collectionSuspended = define<Moderation & { name: string; url: string }>({
  key: "collection-suspended",
  subject: (v) => `Your collection "${v.name}" was suspended on roam.pub`,
  message: (v) => ({
    preview: "The collection and its pages are hidden there.",
    heading: "Your collection was suspended",
    blocks: [
      { p: `A roam.pub moderator suspended your collection "${v.name}".` },
      details([{ label: "Collection", value: v.url, href: v.url }, ...reasonRow(v)]),
      { p: "The collection and its pages are hidden there. The pages stay in their own graphs." },
    ],
    note: contactNote(v),
  }),
});

export const collectionRestored = define<Moderation & { name: string; url: string }>({
  key: "collection-restored",
  subject: (v) => `Your collection "${v.name}" is back on roam.pub`,
  message: (v) => ({
    preview: "It's visible again.",
    heading: "Your collection is back",
    blocks: [
      { p: `A roam.pub moderator lifted the suspension on "${v.name}". It's visible again.` },
      ...(v.reason ? [details(reasonRow(v))] : []),
    ],
    action: { label: "View collection", url: v.url },
  }),
});

export const accountBanned = define<Moderation>({
  key: "account-banned",
  subject: () => "Your roam.pub account was suspended",
  message: (v) => ({
    preview: "Your graphs and pages are hidden.",
    heading: "Your account was suspended",
    blocks: [
      { p: "A roam.pub moderator suspended your account." },
      ...(v.reason ? [details(reasonRow(v))] : []),
      { p: "You've been logged out, your graphs and pages are hidden, and the Roam extension can no longer publish." },
    ],
    note: contactNote(v),
  }),
});

export const accountRestored = define<Moderation>({
  key: "account-restored",
  subject: () => "Your roam.pub account is active again",
  message: (v) => ({
    preview: "You can log in and publish again.",
    heading: "Your account is active again",
    blocks: [
      { p: "A roam.pub moderator restored your account. You can log in and publish again, and your pages are visible as before." },
      ...(v.reason ? [details(reasonRow(v))] : []),
    ],
  }),
});
