import type { Metadata } from "next";
import { BlockList } from "@/components/roam/block-tree";
import { block, siteLinks } from "@/components/roam/outline";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Costs · Roam Publish",
  description: "What it costs to keep Roam Publish running.",
};

const outline = [
  block("Roam Publish is free to use, with an asterisk: running it isn't free for me. Here's what it takes to keep it online."),
  block("**Hosting: [Railway](https://railway.com)**", [
    block("Runs the app and its database. This is the main cost, and it's usage-based, so it grows as more pages get published and viewed."),
  ]),
  block("**Email: [Resend](https://resend.com)**", [
    block("Sends sign-in and verification emails. Free up to 100 emails a day."),
    block("Past that, I'd need the paid plan at 20 USD a month."),
  ]),
  block("**Analytics: [Umami](https://umami.is)**", [
    block("Privacy-friendly traffic stats, so I can tell what's being used. No ads and no tracking across other sites."),
    block("20 USD a month."),
  ]),
  block("**Why the asterisk**", [
    block("I pay for all of this myself, and for now it's free to you."),
    block("If Roam Research's revenue sharing and/or donations can cover these costs, it will stay free."),
    block("I plan to cover these costs myself for at least the first 6 months."),
    block("If the site becomes a financial strain after that, I will first exhaust all options to lower costs without compromising much on features. If that doesn't do it, I may introduce a small fee, just enough to keep the hosting and development going."),
    block("Before any change, I'll give at least 2 months' notice so there's time to share feedback, suggest alternatives, or find other ways to support the site."),
    block("For smaller changes that could still noticeably affect your experience, such as trimmed features, I may notify you by email instead."),
    block("If it's useful to you, [buy me a coffee](https://buymeacoffee.com/ejqs) and it goes toward the bills above."),
  ]),
];

export default function CostsPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1 px-3 py-4 sm:px-4 sm:py-12">
        <article className="mx-auto w-full max-w-[700px] rounded-sm bg-card px-5 py-8 text-[16px] shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_1px_1px_rgba(17,20,24,0.2)] sm:px-12 sm:py-12">
          <h1 className="mb-6 text-[32px] sm:text-[42px] leading-tight font-semibold">Costs</h1>
          <BlockList nodes={outline} links={siteLinks} />
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
