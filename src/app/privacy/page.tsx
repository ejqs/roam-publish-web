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
    block("Your account: email address, name, and a hashed password. Login sessions record the IP address and browser they came from."),
    block("What you publish: the page or block text and structure the extension sends, its title, tags, byline and settings."),
    block(
      "Your API keys are stored hashed. A Roam append-only token you choose to keep is stored encrypted and is never shown again or sent anywhere but Roam.",
    ),
    block(
      "Views and upvotes: when a signed-in person who has a graph opens or upvotes a page, that's recorded against their account (one per page), to count views and rank Discover. Anonymous visits aren't recorded this way.",
    ),
    block(
      "Reports: what you write, an email address if you give one (or your account's, when signed in), and a one-way hash of your IP address to stop repeat reports.",
    ),
    block(
      "Rate limiting keeps IP addresses in the server's memory for a few minutes. They aren't written to the database.",
    ),
    block(
      "Cookies: a login session cookie, and a cookie for each password-protected page you unlock (for 30 days). No advertising or tracking cookies.",
    ),
  ]),
  block("**Analytics**", [
    block(
      "The website uses [Umami](https://umami.is) (Umami Cloud) for privacy-friendly, aggregate statistics: page views, referrers, browsers, devices and countries. It sets no cookies and doesn't track you across sites.",
    ),
    block("The Roam extension has no analytics."),
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
    block("[Railway](https://railway.com) hosts the website and its database."),
    block("[Resend](https://resend.com) sends account emails (verification, password reset, invites, moderation notices)."),
    block("Umami, as above."),
    block("[Roam Research](https://roamresearch.com) receives the blocks roam.pub appends to your graph with your token."),
    block("Nothing is sold or shared for advertising."),
  ]),
  block("**Keeping and deleting**", [
    block("Unpublishing a page deletes it. Deleting a graph deletes its pages, members' pages included, and its keys."),
    block(
      "Deleting your account (Settings) deletes your graphs, pages, collections, keys and profile, and what you published into other people's graphs.",
    ),
    block(
      "If a moderator had acted on your account, a few things are kept after deletion so it can't simply be re-created: your graph names, usernames, and a one-way hash of your email.",
    ),
    block("A short log of moderation actions and account deletions is kept to run the service safely."),
    block("There are no backups yet, so deleted data can't be recovered."),
  ]),
  block("**Your choices**", [
    block("You can see, change or delete everything you publish from the dashboard, and delete your account at any time."),
    block("To ask for a copy of your data, or about anything here, email ejqs [at] ejqs [dot] net."),
  ]),
  block("**Changes**", [
    block("If this policy changes in a way that matters, the date above changes and signed-up users are told by email."),
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
