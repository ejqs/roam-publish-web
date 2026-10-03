import type { Metadata } from "next";
import { ASIDE_MARK, BlockList } from "@/components/roam/block-tree";
import { block, siteLinks } from "@/components/roam/outline";
import { FeeNote } from "@/components/fee-note";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Costs · Roam Publish",
  description: "What it costs to keep Roam Publish running.",
};

const outline = [
  block("Roam Publish is free to use. Running it isn't free for me, so here's what it costs to keep online."),
  block("**Hosting: [Railway](https://railway.com)**", [
    block("Runs the app and its database. This is the main cost, and it grows with usage."),
  ]),
  block("**Email: [Resend](https://resend.com)**", [
    block("Sends sign-in emails. Free for now, 20 USD a month if it outgrows the free tier."),
  ]),
  block("**Analytics and page views: [Umami](https://umami.is)**", [
    block("Shows you how many people view your published pages. Privacy-friendly, with no ads and no tracking across other sites."),
    block("20 USD a month."),
  ]),
  block("**Why the asterisk**", [
    block("I'm paying for this myself and will cover it for at least the first 6 months."),
    block(`If it becomes a strain, I'll look at cutting costs first. If that isn't enough, I may add a small fee${ASIDE_MARK}, with at least 2 months' notice.`),
    block("If Roam Research's revenue sharing or donations cover the costs, it stays free."),
    block("If it's useful to you, [buy me a coffee](https://buymeacoffee.com/ejqs) and it goes toward the bills."),
  ]),
];

const asides = { [outline[4].children[1].uid]: <FeeNote /> };

export default function CostsPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1 px-3 py-4 sm:px-4 sm:py-12">
        <article className="mx-auto w-full max-w-[700px] rounded-sm bg-card px-5 py-8 text-[16px] shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_1px_1px_rgba(17,20,24,0.2)] sm:px-12 sm:py-12">
          <h1 className="mb-6 text-[32px] sm:text-[42px] leading-tight font-semibold">Costs</h1>
          <BlockList nodes={outline} links={siteLinks} asides={asides} />
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
