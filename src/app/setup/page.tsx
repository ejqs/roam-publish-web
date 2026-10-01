import type { Metadata } from "next";
import { BlockList } from "@/components/roam/block-tree";
import { block, siteLinks } from "@/components/roam/outline";
import type { PageLinks } from "@/components/roam/markup";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = { title: "Setting it up · Roam Publish" };

const links: PageLinks = new Map([...siteLinks, ["sign up", "/signup"]]);

const outline = [
  block("You'll need an active [[Roam Research]] account."),
  block("[[Sign up]] for Roam Publish."),
  block("Install Roam Publish from [[Roam Depot]], then log in from its settings."),
  block(
    "Paste a temporary append-only token. It writes a one-time code to your [[Daily Notes]] to prove the graph is yours.",
  ),
  block("Right-click any page or block → **Publish**."),
];

export default function SetupPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1 px-4 py-12">
        <article className="mx-auto w-full max-w-[700px] rounded-sm bg-card px-6 py-12 text-[16px] shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_1px_1px_rgba(17,20,24,0.2)] sm:px-12">
          <h1 className="mb-6 text-[42px] leading-tight font-semibold">Setting it up</h1>
          <BlockList nodes={outline} links={links} />
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
