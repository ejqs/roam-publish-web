import Link from "next/link";
import { connection } from "next/server";
import { BlockList } from "@/components/roam/block-tree";
import { RoamText } from "@/components/roam/markup";
import { block, siteLinks } from "@/components/roam/outline";
import { ISSUES_URL, SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
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

// Its own list so the footer's About and Contact links have somewhere to land.
const about = [
  block("**Who runs this**", [
    block("Me, [@ejqs](https://ejqs.net). It's free and not affiliated with Roam Research."),
    block("I pay for hosting myself. If it's useful to you, [buy me a coffee](https://buymeacoffee.com/ejqs)."),
    block(`Bugs and ideas: [GitHub Issues](${ISSUES_URL}) or send it over in ejqs [at] ejqs [dot] net`),
  ]),
];

export default async function Home() {
  await connection(); // Render per request (cached query), never at build time.
  const { rows: trending } = await discoverPublications("trending", 5, 0);

  return (
    <>
      <SiteHeader />
      <main className="flex-1 px-4 py-12">
        <article className="mx-auto w-full max-w-[700px] rounded-sm bg-card px-6 py-12 text-[16px] shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_1px_1px_rgba(17,20,24,0.2)] sm:px-12">
          <h1 className="mb-6 text-[42px] leading-tight font-semibold">Roam Publish</h1>
          <BlockList nodes={outline} links={siteLinks} />
          <section id="about" aria-label="About" className="scroll-mt-16">
            <span id="contact" className="block scroll-mt-16" />
            <BlockList nodes={about} links={siteLinks} />
          </section>
          {/* Same markup as BlockList, with live rows that aren't Roam text. */}
          <ul className="flex flex-col">
            <li className="relative pl-6">
              <Bullet />
              <div className="py-0.5 leading-[1.6]">
                <RoamText text="Trending pages on [[Discover]]" links={siteLinks} />
              </div>
              <ul className="ml-2 flex flex-col border-l border-border/70">
                <li className="relative pl-6">
                  <Bullet />
                  <div className="py-0.5 leading-[1.6]">
                    <RoamText
                      text="__Discovery is opt-in. Pages only show up here if their owner turns it on for their graph; otherwise they're reachable only by link.__"
                      links={siteLinks}
                    />
                  </div>
                </li>
                {trending.length === 0 ? (
                  <li className="relative pl-6">
                    <Bullet />
                    <div className="py-0.5 leading-[1.6] text-muted-foreground">Nothing here yet.</div>
                  </li>
                ) : (
                  trending.map((p) => (
                    <li key={`${p.graphName}:${p.rootUid}`} className="relative pl-6">
                      <Bullet />
                      <div className="py-0.5 leading-[1.6] break-words">
                        <Link
                          href={p.href}
                          className="text-link hover:underline"
                        >
                          {plainText(p.title) || "Untitled"}
                        </Link>{" "}
                        <span className="text-muted-foreground">in {p.source.label}</span>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </li>
          </ul>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}

function Bullet() {
  return <span aria-hidden className="absolute top-[9px] left-2 size-[5px] rounded-full bg-roam-bullet" />;
}
