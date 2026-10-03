import type { Metadata } from "next";
import { BlockList } from "@/components/roam/block-tree";
import { PageLinks } from "@/components/roam/markup";
import { block, siteLinks } from "@/components/roam/outline";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ENCRYPT_PASSWORD_MIN } from "@/lib/encryption-rules";

export const metadata: Metadata = {
  title: "Encrypted pages · Roam Publish",
  description: "What encrypting a page with its password protects against, and what it doesn't.",
};

const links = new PageLinks([...siteLinks, ["privacy policy", "/privacy"]]);

const outline = [
  block(
    "A password-protected page can also be encrypted with its password. This page explains what that protects against, and what it doesn't. In short: **it isn't end-to-end encryption. It's as safe as you trust roam.pub and the company that hosts it.**",
  ),
  block("**What it protects against**", [
    block(
      "The page's text is stored encrypted. Its search text, tags and content hash are removed or encrypted too. Without the page's password, a copy of the database shows none of it.",
    ),
    block(
      "So if the database or a backup of it leaks, or someone gets to look inside it, they can't read encrypted pages. They'd have to guess the password, and each guess is made deliberately slow.",
    ),
  ]),
  block("**What it doesn't protect against**", [
    block(
      "**The server can read the page while it's in use.** roam.pub decrypts an encrypted page every time someone reads it, to build the page they see. It also sees the page's text when you publish it from Roam, and readers' passwords when they type them in. The page is never stored readable, but it passes through the server readable.",
    ),
    block(
      "That means someone in control of the running server could read encrypted pages or collect passwords. That could be the operator of roam.pub, [Railway](https://railway.com) (which hosts it), or an attacker who broke into it. End-to-end encryption, where only readers' browsers can decrypt, would protect against that. This isn't that.",
    ),
    block(
      "**Anyone with the password.** Everyone who knows it can read the page, and can pass it on. Members of the graph or collection need it too: encryption doesn't let them in on their own.",
    ),
    block(
      "**The title.** It stays readable: it's part of the page's link, and listed pages show it on their graph's or collection's front page.",
    ),
    block(
      "**When and how often the page is read.** View counts and the number of people who unlocked it work as they do for any password-protected page.",
    ),
  ]),
  block("**Passwords**", [
    block(
      `Encrypted pages need a password of at least ${ENCRYPT_PASSWORD_MIN} characters. Longer is better: a leaked database lets someone try guesses without asking roam.pub, so a short or common password can be found.`,
    ),
    block(
      "When a reader unlocks an encrypted page, their browser keeps a key made from the password for 30 days, in a cookie that's itself encrypted with the server's secret key. That's what lets them come back without typing it again.",
    ),
    block(
      "Changing a password needs the current one. If it's forgotten, nobody can open the page with a new password, roam.pub included: republish the page from Roam and it's encrypted again with the new one. Your Roam graph keeps the original either way.",
    ),
  ]),
  block("**What turns off**", [
    block(
      "Search, tags, related pages and excerpts all need the page's text, so they're off while a page is encrypted. They come back if you turn encryption off.",
    ),
  ]),
  block("**If you need more than this**", [
    block(
      "If a page must stay secret even from roam.pub and its host, don't publish it. Encryption here protects against leaks of stored data, not against the service itself.",
    ),
    block("Everything else roam.pub does with your data is in the [[Privacy policy]]."),
  ]),
];

export default function EncryptionPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1 px-3 py-4 sm:px-4 sm:py-12">
        <article className="mx-auto w-full max-w-[700px] rounded-sm bg-card px-5 py-8 text-[16px] shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_1px_1px_rgba(17,20,24,0.2)] sm:px-12 sm:py-12">
          <h1 className="mb-6 text-[32px] sm:text-[42px] leading-tight font-semibold">Encrypted pages</h1>
          <BlockList nodes={outline} links={links} />
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
