import type { Metadata } from "next";
import { BlockList } from "@/components/roam/block-tree";
import { PageLinks } from "@/components/roam/markup";
import { block, siteLinks } from "@/components/roam/outline";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { ENCRYPT_PASSWORD_MIN } from "@/lib/encryption-rules";

export const metadata: Metadata = {
  title: "Encrypted pages · Roam Publish",
  description: "The rules for encrypting a page with its password, what that protects against, and what it doesn't.",
};

const links = new PageLinks([...siteLinks, ["privacy policy", "/privacy"], ["encryption versions", "/privacy/encryption/versions"]]);

const outline = [
  block(
    "A password-protected page can also be encrypted with its password: its text is stored locked, and only that password unlocks it. This page explains the rules, then what encryption protects against and what it doesn't. In short: **readers' browsers decrypt it, so roam.pub never reads it to show it. Published from extension 0.2.0 or newer, it's encrypted in Roam, so roam.pub never sees its text at all.** Each encrypted page says which version of encryption it has: see [[Encryption versions]].",
  ),
  block("**The rules**", [
    block("**Every place it's shown needs a password**", [
      block(
        "A page can be shown in its graph and in any number of collections. To encrypt it, every one of those places has to use Password, with a password to use there: the graph's or collection's password, or one set just for the page in that place.",
      ),
      block(
        `Those passwords need at least ${ENCRYPT_PASSWORD_MIN} characters. A password set before encryption existed has to be entered again before it can encrypt.`,
      ),
      block(
        "While a page is encrypted, it stays Password everywhere: it can't switch to Open or Members only until you turn encryption off.",
      ),
    ]),
    block("**Each place's password opens it**", [
      block(
        "If the page is in your graph with the graph's password and in a collection with the collection's password, either password opens it, each in its own place. Readers never need more than the one for the place they're reading.",
      ),
      block(
        "Everyone needs it: members, collection managers and you too. Signing in doesn't unlock an encrypted page, because roam.pub itself can't read it without a password.",
      ),
      block(
        "The page is decrypted in the reader's browser. roam.pub sends it still encrypted, and only to readers who proved they know the password.",
      ),
    ]),
    block("**Ways to turn it on**", [
      block("**One page:** the Encrypt with password switch, in the page's Manage dialog on your dashboard."),
      block(
        "**New pages:** Encrypt new password pages, in a graph's or collection's access settings. Pages published or added there from then on are encrypted, when every place they're shown has a password.",
      ),
      block(
        "**Pages already there:** Encrypt existing pages, in the same settings. Decrypt existing pages does the reverse, with the password they share.",
      ),
    ]),
    block("**Republishing doesn't need the password**", [
      block(
        "When you republish from Roam, the new text is locked to the same passwords right away. Nothing to type. From extension 0.2.0, it's locked in Roam before it's sent.",
      ),
    ]),
    block("**Adding it somewhere new**", [
      block(
        `To add an encrypted page to another collection, that collection needs a password of at least ${ENCRYPT_PASSWORD_MIN} characters. The page uses Password there.`,
      ),
      block(
        "It opens there once you republish it from Roam, which locks it for every place's password at once. Adding it from the Roam extension republishes it for you, so it opens right away.",
      ),
      block(
        "Added on roam.pub, it shows Needs republish there until then, unless you enter the page's current password when you add it.",
      ),
      block(
        "Taking it out of its last collection puts it back in your graph, unlisted, behind the graph's password. If your graph has no password, roam.pub refuses: set one, unpublish the page, or turn encryption off first.",
      ),
    ]),
    block("**Changing or forgetting a password**", [
      block(
        "Changing a password that encrypted pages use needs the current one, so they keep opening with the new one.",
      ),
      block(
        "If it's forgotten, you can still set a new one, but the pages it opened can't be read in that place until you republish them from Roam. Your dashboard marks them Needs republish. Nobody can recover them, roam.pub included, but your Roam graph keeps the original.",
      ),
    ]),
    block("**Turning it off**", [
      block(
        "Switch Encrypt with password off, and enter a password that opens the page. Search, tags, related pages and excerpts come back.",
      ),
    ]),
  ]),
  block("**What it protects against**", [
    block(
      "The page's text is stored encrypted. Its search text, tags and content hash are removed or encrypted too. Without the page's password, a copy of the database shows none of it.",
    ),
    block(
      "So if the database or a backup of it leaks, or someone gets to look inside it, they can't read encrypted pages. They'd have to guess the password, and each guess is made deliberately slow.",
    ),
    block(
      "Reading doesn't expose it either. Readers' browsers decrypt the page, and unlocking sends roam.pub a proof made from the password, not the password. So the running server never sees an encrypted page's text or a reader's password when someone reads it.",
    ),
  ]),
  block("**What it doesn't protect against**", [
    block(
      "**The server sees it when it encrypts it (encryption v1).** Extensions older than 0.2.0 send the page's text to roam.pub, which encrypts it before storing it, and so does encrypting a page on your dashboard. Passwords you type on your dashboard (to set or change one, encrypt or decrypt pages, or add a page somewhere new) reach the server too. So does a reader's password the first time it's used after this change, if it was set before proofs existed: from then on, it's a proof.",
    ),
    block(
      "**The site's own code.** The code that decrypts pages in readers' browsers comes from roam.pub. Someone in control of the running server could change it to collect passwords as they're typed. That could be the operator of roam.pub, [Railway](https://railway.com) (which hosts it), or an attacker who broke into it.",
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
      "When a reader unlocks an encrypted page, their browser keeps the password's key for 30 days, in its own storage, where pages can use it but not read it out. That's what lets them come back without typing it again. roam.pub never gets that key. A private window forgets it when it closes.",
    ),
  ]),
  block("**What turns off**", [
    block(
      "Search, tags, related pages and excerpts all need the page's text, so they're off while a page is encrypted. They come back if you turn encryption off.",
    ),
  ]),
  block("**If you need more than this**", [
    block(
      "If a page must stay secret even from roam.pub and its host, publish it from extension 0.2.0 or newer where it's Password everywhere, so it's encrypted in Roam (v2), and don't encrypt or decrypt it on your dashboard. The site's own code is still a limit, as above.",
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
