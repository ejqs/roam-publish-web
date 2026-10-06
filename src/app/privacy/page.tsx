import type { Metadata } from "next";
import { BlockList } from "@/components/roam/block-tree";
import { PageLinks } from "@/components/roam/markup";
import { block, siteLinks } from "@/components/roam/outline";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { lastUpdated } from "@/lib/last-updated";

export const metadata: Metadata = {
  title: "Privacy · Roam Publish",
  description: "What Roam Publish collects, why, who else handles it, and how to delete it.",
};

const links = new PageLinks([...siteLinks, ["encrypted pages", "/privacy/encryption"]]);

const outline = [
  block("**In short**", [
    block(
      "Roam Publish (roam.pub and the Roam Publish extension) is run by one person, [@ejqs](https://ejqs.net), from the Philippines. It isn't affiliated with Roam Research.",
    ),
    block("You choose what's published and who can read it. The extension sends nothing until you publish."),
    block("No ads, no tracking cookies, and nothing is sold."),
    block("Deleting something deletes it, for good."),
    block("Questions, or to ask about your data: support@roam.pub or ejqs [at] ejqs [dot] net."),
  ]),
  block("**What's public**", [
    block(
      "Each page is as public as you set it: anywhere from listed on Discover to readable only by members or people with its password.",
    ),
    block(
      "Published pages include their block references and embeds, which can come from elsewhere in your graph. Check them before publishing.",
    ),
    block("Your username, profile bio and graph names are public when you choose to show them."),
    block("Feed readers can copy pages from RSS feeds you turn on, and a copy may outlive the page."),
  ]),
  block("**What's collected**", [
    block(
      "Your account: email address, name and a hashed password. Login sessions record the IP address and browser they came from.",
    ),
    block("Your graphs: their names, and the time zone the extension sends."),
    block("What you publish: the page or block text and structure the extension sends, its title, tags, byline and settings."),
    block(
      "Your API keys, hashed. If you turn on the change log, your Roam append-only token, encrypted, and only ever sent to Roam.",
    ),
    block(
      "Views and upvotes by signed-in people who have a graph, one per page, to count views and rank Discover. Anonymous visits aren't recorded this way.",
    ),
    block("Invites: the invited person's email address and who sent it."),
    block(
      "Reports: what you write, an email address if you give one (or your account's, when signed in), and a one-way hash of your IP address to catch repeat reports.",
    ),
    block("IP addresses, briefly and only in memory, to rate-limit requests. They aren't written to the database."),
    block(
      "Error and slow-request logs, without IP addresses or emails. Railway, the host, keeps its own request logs, which include IP addresses, for a limited time.",
    ),
    block("Cookies, all needed for the site to work, none for advertising or tracking:", [
      block("Your login session."),
      block("Each password-protected page you unlock, plus its key (encrypted) when the page is encrypted."),
      block("An announcement you dismissed."),
      block("When you last opened What's new."),
    ]),
    block("Your browser also notes each page you've viewed while signed in, so a view is only counted once."),
  ]),
  block("**Analytics**", [
    block(
      "The website uses [Umami](https://umami.is) (Umami Cloud) for aggregate statistics: page views, referrers, browsers, devices, countries and page load speed (Core Web Vitals). It sets no cookies and doesn't track you across sites.",
    ),
    block(
      "Published pages can show their view count and readers' countries, from these numbers plus signed-in readers. Countries with fewer than 3 views are grouped together. Page owners can hide view counts or turn them off.",
    ),
    block("The Roam extension has no analytics."),
  ]),
  block("**The Roam extension**", [
    block("It sends a page or block to roam.pub only when you publish, unpublish or check it."),
    block(
      "While Roam is open, about every 5 minutes, it tells roam.pub which of its status link blocks still exist (block ids only, no text). Turning off the Roam Publish block stops this.",
    ),
    block(
      "It only writes the Roam Publish block into your graph, plus change log entries if you kept an append-only token.",
    ),
  ]),
  block("**Why it's used**", [
    block("Your account and what you publish: to provide the service you signed up for."),
    block(
      "IP addresses, reports, the moderation log and the blocklist: to keep the service safe and working, and to stop abuse.",
    ),
    block("Aggregate analytics: to see how the site is used and show page view counts."),
    block("Account emails: sent only when needed to run your account. There's no marketing email."),
  ]),
  block("**Who else handles it**", [
    block("[Railway](https://railway.com) hosts the website and its database, on servers in Singapore."),
    block(
      "[Resend](https://resend.com) sends account emails (verification, password reset, invites, moderation notices). " +
        "Emails you send to roam.pub, such as a reply to one of those, are kept by Resend and read by roam.pub's admins, who may write back.",
    ),
    block("Umami runs the analytics above."),
    block("[Roam Research](https://roamresearch.com) receives the blocks roam.pub appends to your graph with your token."),
    block(
      "Images, videos and embeds on published pages, such as YouTube (in its privacy-enhanced mode), Vimeo, Loom, or wherever an author's images are stored, load straight from those sites. They see your IP address and browser, under their own privacy policies.",
    ),
    block("Resend and Umami may handle data in other countries, including the United States."),
    block(
      "Beyond these, data is only handed over when the law requires it, such as a valid court order. Where the law allows, you'll be told first.",
    ),
  ]),
  block("**How long it's kept**", [
    block(
      "Your account, graphs and pages: until you delete them. Unpublishing a page deletes it. Deleting a graph deletes its pages, including members' pages, and its API keys. Deleting your account (Settings) deletes your graphs, pages, collections, API keys and profile, and what you published into other people's graphs.",
    ),
    block("Login sessions: until you sign out or delete your account."),
    block("Invites: 7 days. The codes that prove you own a graph are stored hashed and expire too."),
    block("Rate-limit IP addresses: 15 minutes at most."),
    block("Cookies: 30 days for unlocked pages and dismissed announcements, about a year for What's new."),
    block(
      "Reports, and a short log of moderation actions and account deletions: no fixed end date, to deal with repeated abuse. When you delete your account, the email address on reports you filed is replaced with a hash.",
    ),
    block(
      "If a moderator had acted on your account, your graph names, usernames and a one-way hash of your email are kept after deletion, so it can't simply be re-created.",
    ),
    block("There are no backups, so deleted data can't be recovered."),
  ]),
  block("**Security**", [
    block("Everything is sent over HTTPS."),
    block("Account passwords, page passwords and API keys are stored hashed, and append-only tokens encrypted."),
    block(
      "The operator can access what's stored, and only uses it to run, support and moderate the service. The exception is encrypted pages, whose text is stored encrypted with their passwords; their titles stay readable. This isn't end-to-end encryption: the server decrypts them to show them. See [[Encrypted pages]].",
    ),
    block(
      "If a data breach affects your information, you'll be told, and so will the National Privacy Commission, as the law requires.",
    ),
  ]),
  block("**Your rights**", [
    block("The Philippine Data Privacy Act of 2012 applies, along with the privacy laws where you live."),
    block(
      "Under them (for example, the GDPR in the EU and UK), you have the right to know how your data is used, get a copy, correct it, object to how it's used, and have it deleted.",
    ),
    block("You can see, change or delete everything you publish from the dashboard, and delete your account at any time."),
    block("For a copy of your data, or anything else, email support@roam.pub or ejqs [at] ejqs [dot] net."),
    block(
      "You can also complain to a data protection authority: the Philippines' [National Privacy Commission](https://privacy.gov.ph), or the one where you live.",
    ),
  ]),
  block("**Children**", [
    block("Roam Publish isn't meant for children under 13. An account found to belong to one is deleted."),
  ]),
  block("**Changes**", [
    block("If this policy changes in a way that matters, the date above changes and signed-up users are told by email."),
    block("Every past version is in the [full change history](https://github.com/ejqs/roam-publish-web/commits/main/src/app/privacy/page.tsx)."),
  ]),
];

export default function PrivacyPage() {
  const updated = lastUpdated("privacy");
  return (
    <>
      <SiteHeader />
      <main className="flex-1 px-3 py-4 sm:px-4 sm:py-12">
        <article className="mx-auto w-full max-w-[700px] rounded-sm bg-card px-5 py-8 text-[16px] shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_1px_1px_rgba(17,20,24,0.2)] sm:px-12 sm:py-12">
          <h1 className="mb-6 text-[32px] sm:text-[42px] leading-tight font-semibold">Privacy</h1>
          <BlockList nodes={updated ? [block(`Last updated ${updated}.`), ...outline] : outline} links={links} />
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
