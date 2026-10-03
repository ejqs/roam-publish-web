import type { Metadata } from "next";
import { BlockList } from "@/components/roam/block-tree";
import { block, siteLinks } from "@/components/roam/outline";
import { PageLinks } from "@/components/roam/markup";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Terms · Roam Publish",
  description: "The rules for using Roam Publish.",
};

const UPDATED = "October 3rd, 2026";

const links = new PageLinks([...siteLinks, ["privacy policy", "/privacy"]]);

const outline = [
  block(`Last updated ${UPDATED}. By using Roam Publish (roam.pub and the Roam Publish extension) you agree to these terms.`),
  block("**The service**", [
    block(
      "Roam Publish is a free service run by one person, [@ejqs](https://ejqs.net). It isn't affiliated with or endorsed by Roam Research.",
    ),
    block("It's provided as is, without warranties. It may change, have outages, or lose data: there are no backups yet. Keep your own copy of anything important (your Roam graph is the original)."),
    block("It may change or end. Where possible you'll get notice by email first."),
  ]),
  block("**Your account**", [
    block("You need to be at least 13, and old enough where you live to agree to these terms."),
    block("Keep your password and API keys to yourself. You're responsible for what's done with them."),
    block("Only connect graphs you're an admin of, and only publish to other people's graphs or collections with their invitation."),
  ]),
  block("**Your content**", [
    block("You keep all rights to what you publish."),
    block(
      "You let Roam Publish store, display and distribute it, as you set it to be shown (on its page, your graph's front page, collections, Discover, RSS feeds and search), for as long as it's published.",
    ),
    block("You're responsible for what you publish, including block references and embeds pulled in from elsewhere in your graph."),
  ]),
  block("**Not allowed**", [
    block("Anything illegal, or content you don't have the right to publish."),
    block("Harassment, threats, hate, or sharing other people's private information."),
    block("Sexual content involving minors, or non-consensual intimate imagery."),
    block("Spam, scams, phishing, malware, or links meant to deceive."),
    block("Impersonating someone, or pretending to be Roam Research."),
    block("Attacking, overloading or probing the service, or getting around its limits, moderation or access controls."),
  ]),
  block("**Moderation**", [
    block(
      "Pages, graphs, collections and accounts that break these terms can be removed, suspended or banned, with or without notice. You'll usually get an email saying why.",
    ),
    block("Report anything that breaks them with the Report button on any page. To appeal a decision, email ejqs [at] ejqs [dot] net."),
  ]),
  block("**Ending**", [
    block("You can delete your account at any time from Settings. What that deletes is in the [[Privacy policy]]."),
  ]),
  block("**Liability**", [
    block(
      "To the extent the law allows, Roam Publish and its operator aren't liable for indirect or consequential losses, or for lost data, content or profits, from using the service.",
    ),
  ]),
  block("**Changes**", [
    block("These terms may change. If a change matters, the date above changes and signed-up users are told by email."),
    block("Questions: ejqs [at] ejqs [dot] net."),
  ]),
];

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1 px-3 py-4 sm:px-4 sm:py-12">
        <article className="mx-auto w-full max-w-[700px] rounded-sm bg-card px-5 py-8 text-[16px] shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_1px_1px_rgba(17,20,24,0.2)] sm:px-12 sm:py-12">
          <h1 className="mb-6 text-[32px] sm:text-[42px] leading-tight font-semibold">Terms</h1>
          <BlockList nodes={outline} links={links} />
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
