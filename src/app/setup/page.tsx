import type { Metadata } from "next";
import { BlockList } from "@/components/roam/block-tree";
import { block, siteLinks } from "@/components/roam/outline";
import { PageLinks } from "@/components/roam/markup";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Setting it up · Roam Publish" };

const links = new PageLinks([...siteLinks, ["sign up", "/signup"]]);

const outline = [
  block("You'll need an active [Roam Research](https://roamresearch.com) account."),
  block("[[Sign up]] for Roam Publish."),
  block(
    "Connect your personal graph with a temporary append-only token. It adds one block to your Daily Notes to prove the graph is yours.",
  ),
  block("Install Roam Publish from Roam Depot, then paste your API key from the dashboard into its settings."),
  block("Shared graph? Whoever connects it first owns it here and invites everyone else, who each get their own key."),
  block("Right-click any page or block → **Publish**."),
];

export default function SetupPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1 px-3 py-4 sm:px-4 sm:py-12">
        <article className="mx-auto w-full max-w-[700px] rounded-sm bg-card px-5 py-8 text-[16px] shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_1px_1px_rgba(17,20,24,0.2)] sm:px-12 sm:py-12">
          <h1 className="mb-6 text-[32px] sm:text-[42px] leading-tight font-semibold">Setting it up</h1>
          <BlockList nodes={outline} links={links} />
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
