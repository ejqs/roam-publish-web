import { connection } from "next/server";
import { BlockList } from "@/components/roam/block-tree";
import { block, siteLinks } from "@/components/roam/outline";
import { ISSUES_URL, SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TrendingPages } from "@/components/trending-pages";
import { discoverPublications } from "@/lib/discover";
import { plainText } from "@/lib/slug";

const outline = [
  block("Publish a page or a single block from your [[Roam Research]] graph to the web.", [
    block("You'll need an active Roam Research account."),
    block("Only what you publish is public. The rest of your graph stays where it is."),
    block("Page refs, block refs, embeds and ^^highlights^^ render the way they do in Roam."),
  ]),
  block("New here? Start with [[Setting it up]]"),
];

// Its own list so the footer's "About & contact" link has somewhere to land.
const about = [
  block("**Who runs this**", [
    block("Me, [@ejqs](https://ejqs.net). It's free and not affiliated with Roam Research."),
    block("I pay for hosting myself. If it's useful to you, [buy me a coffee](https://buymeacoffee.com/ejqs)."),
    block(`Bugs and ideas: [GitHub Issues](${ISSUES_URL}) or send it over in ejqs [at] ejqs [dot] net`),
  ]),
];

export default async function Home() {
  await connection(); // Render per request (cached query), never at build time.
  const { rows: trending } = await discoverPublications("trending", 10, 0);

  return (
    <>
      <SiteHeader />
      <main className="flex-1 px-3 py-4 sm:px-4 sm:py-12">
        <article className="mx-auto w-full max-w-[700px] rounded-sm bg-card px-5 py-8 text-[16px] shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_1px_1px_rgba(17,20,24,0.2)] sm:px-12 sm:py-12">
          <h1 className="mb-6 text-[32px] sm:text-[42px] leading-tight font-semibold">Roam Publish</h1>
          <BlockList nodes={outline} links={siteLinks} />
          <section id="about" aria-label="About" className="scroll-mt-16">
            <BlockList nodes={about} links={siteLinks} />
          </section>
          {/* Same markup as BlockList, with live rows that aren't Roam text. */}
          <ul className="flex flex-col">
            <TrendingPages
              rows={trending.map((p) => ({
                key: `${p.graphName}:${p.rootUid}`,
                href: p.href,
                title: plainText(p.title) || "Untitled",
                source: p.source.label,
              }))}
            />
          </ul>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
