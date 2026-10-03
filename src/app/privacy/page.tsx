import type { Metadata } from "next";
import { BlockList } from "@/components/roam/block-tree";
import { block, siteLinks } from "@/components/roam/outline";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Privacy · Roam Publish",
  description: "What Roam Publish collects, why, who else handles it, and how to delete it.",
};

const UPDATED = "October 3rd, 2026";

const outline = [
  block(`Last updated ${UPDATED}.`),
  block("**Who runs this**", [
    block(
      "Roam Publish (roam.pub and the Roam Publish extension) is run by one person, [@ejqs](https://ejqs.net). It isn't affiliated with Roam Research.",
    ),
    block("It's run from the Philippines, so the Philippine Data Privacy Act of 2012 applies, along with the privacy laws where you live."),
    block(
      "The operator can access everything stored on the service, and only uses it to run, support and moderate it.",
    ),
    block("Questions, or to ask about your data: ejqs [at] ejqs [dot] net."),
  ]),
  block("**What's public**", [
    block(
      "Whatever you publish, and who can read it, is up to you: unlisted pages are readable by anyone with the link, public pages are also listed on your graph's front page, and pages on Discover are listed site-wide. Password and members-only pages are only shown to people who unlock them or are members.",
    ),
    block(
      "Published pages include their block references and embeds, which can come from elsewhere in your graph. Check them before publishing.",
    ),
    block("Your username, profile bio and graph names are public when you choose to show them."),
    block(
      "RSS feeds you turn on can be copied by feed readers, and a copy may outlive the page if you unpublish it.",
    ),
  ]),
  block("**What's collected**", [
    block(
      "Your account: email address, name, and a hashed password. Login sessions record the IP address and browser they came from, kept until you sign out or delete your account.",
    ),
    block(
      "Your graphs: their names, and the time zone the extension sends. The codes that prove you own a graph are stored hashed and expire.",
    ),
    block("What you publish: the page or block text and structure the extension sends, its title, tags, byline and settings."),
    block(
      "Your API keys are stored hashed. If you opt in to the change log, your Roam append-only token is stored encrypted. It's never shown again and is only ever sent to Roam.",
    ),
    block(
      "Views and upvotes: when a signed-in person who has a graph opens or upvotes a page, that's recorded against their account (one per page), to count views and rank Discover. Anonymous visits aren't recorded this way.",
    ),
    block(
      "Invites: the invited person's email address and who sent it. An invite can be accepted for 7 days.",
    ),
    block(
      "Reports: what you write, an email address if you give one (or your account's, when signed in), and a keyed one-way hash of your IP address, used to drop repeat reports within a day. The hash can't be turned back into the address without the server's secret key.",
    ),
    block(
      "Rate limiting keeps IP addresses in the server's memory while a limit runs (15 minutes at most), and clears them soon after. They aren't written to the database.",
    ),
    block(
      "Logs: the server logs errors and slow requests, without IP addresses or emails. Railway keeps its own request logs, which include IP addresses, for a limited time.",
    ),
    block("Cookies, all needed for the site to work, none for advertising or tracking:", [
      block("A login session cookie."),
      block("One for each password-protected page you unlock, for 30 days."),
      block("One remembering an announcement you dismissed, for 30 days."),
      block("One remembering when you last opened What's new, for about a year."),
    ]),
    block(
      "Your browser also stores a note of each page you've viewed while signed in, so a view is only counted once.",
    ),
  ]),
  block("**Analytics**", [
    block(
      "The website uses [Umami](https://umami.is) (Umami Cloud) for privacy-friendly, aggregate statistics: page views, referrers, browsers, devices and countries. It sets no cookies and doesn't track you across sites.",
    ),
    block(
      "Published pages can show how many times they were viewed, and from which countries, using these aggregate Umami numbers and a count of signed-in readers. Countries with fewer than 3 views are grouped together. Page owners can hide view counts or turn them off.",
    ),
    block("The Roam extension has no analytics."),
  ]),
  block("**Embedded media**", [
    block(
      "Published pages can show images, videos and embeds from other sites, such as YouTube (in its privacy-enhanced mode), Vimeo, Loom, or wherever an author's images are stored. Your browser loads these directly from those sites, which see your IP address and browser, under their own privacy policies.",
    ),
  ]),
  block("**The Roam extension**", [
    block("Nothing leaves Roam until you publish, unpublish or check a page, and then only that page or block goes to roam.pub."),
    block(
      "While Roam is open, about every 5 minutes, it tells roam.pub which of its status link blocks still exist (block ids only, no text). Turning off the Roam Publish block stops this.",
    ),
    block(
      "What it writes into your graph: the Roam Publish block when you publish, and change log entries if you kept an append-only token. Nothing else.",
    ),
  ]),
  block("**Who else handles it**", [
    block("[Railway](https://railway.com) hosts the website and its database, on servers in Singapore."),
    block("[Resend](https://resend.com) sends account emails (verification, password reset, invites, moderation notices)."),
    block("Umami, as above."),
    block("[Roam Research](https://roamresearch.com) receives the blocks roam.pub appends to your graph with your token."),
    block("Resend and Umami may handle data in other countries, including the United States."),
    block("Nothing is sold or shared for advertising."),
  ]),
  block("**Why it's used**", [
    block("Your account and what you publish: to provide the service you signed up for."),
    block(
      "IP addresses, reports, the moderation log and the blocklist: to keep the service safe and working, and to stop abuse.",
    ),
    block("Aggregate analytics: to see how the site is used and show page view counts."),
    block("Account emails: sent only when needed to run your account. There's no marketing email."),
  ]),
  block("**Keeping and deleting**", [
    block("Unpublishing a page deletes it."),
    block("Deleting a graph deletes its pages, including members' pages, and the API keys for it."),
    block(
      "Deleting your account (Settings) deletes your graphs, pages, collections, API keys and profile, and what you published into other people's graphs.",
    ),
    block(
      "If a moderator had acted on your account, a few things are kept after deletion so it can't simply be re-created: your graph names, usernames, and a one-way hash of your email.",
    ),
    block(
      "Reports you filed are kept for moderation. When you delete your account, the email address on them is replaced with a keyed hash.",
    ),
    block(
      "Reports, and a short log of moderation actions and account deletions, are kept with no fixed end date, to deal with repeated abuse.",
    ),
    block("There are no backups yet, so deleted data can't be recovered."),
  ]),
  block("**Your choices**", [
    block("You can see, change or delete everything you publish from the dashboard, and delete your account at any time."),
    block(
      "Depending on where you live (for example under the Philippine Data Privacy Act, or the GDPR in the EU and UK), you have the right to know how your data is used, get a copy, correct it, object to how it's used, and have it deleted.",
    ),
    block("To ask for a copy of your data, or about anything here, email ejqs [at] ejqs [dot] net."),
    block(
      "You can also complain to a data protection authority: the Philippines' [National Privacy Commission](https://privacy.gov.ph), or the one where you live.",
    ),
  ]),
  block("**Changes**", [
    block("If this policy changes in a way that matters, the date above changes and signed-up users are told by email."),
    block("Every past version is in the [full change history](https://github.com/ejqs/roam-publish-web/commits/main/src/app/privacy/page.tsx)."),
  ]),
];

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1 px-3 py-4 sm:px-4 sm:py-12">
        <article className="mx-auto w-full max-w-[700px] rounded-sm bg-card px-5 py-8 text-[16px] shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_1px_1px_rgba(17,20,24,0.2)] sm:px-12 sm:py-12">
          <h1 className="mb-6 text-[32px] sm:text-[42px] leading-tight font-semibold">Privacy</h1>
          <BlockList nodes={outline} links={siteLinks} />
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
