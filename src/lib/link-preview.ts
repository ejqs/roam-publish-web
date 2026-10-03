import { createHash } from "node:crypto";
import type { Metadata } from "next";
import type { Node } from "@/db/schema";
import { pageRef } from "./roam-refs";
import { plainText } from "./slug";

/**
 * What a shared link shows in chat apps and social feeds: the Open Graph and Twitter tags, and the
 * "graph card" image drawn from the same data (lib/og/render.tsx). Protected and encrypted pages get
 * a card that names only their graph or collection, which is in the link anyway.
 */

const EXCERPT = 300;
/** Long enough for two lines under a title in most previews. */
export const DESCRIPTION = 160;
/** Pages drawn around the page on the card. */
export const CARD_LINKS = 5;
const WORDS_PER_MINUTE = 200;

export type PreviewCard =
  | {
      locked: false;
      /** The graph or collection it's shown in. */
      container: string;
      title: string;
      description: string;
      author: string | null;
      tags: string[];
      minutes: number;
      /** Pages it links to, first seen first. */
      links: string[];
      publishedAt: string;
      updatedAt: string;
    }
  | { locked: true; container: string };

/** The first few hundred characters (or `max`) of a page's text, without Roam markup. */
export function excerpt(tree: Node, max = EXCERPT) {
  const parts: string[] = [];
  let length = 0;
  const walk = (n: Node) => {
    for (const child of n.children) {
      if (length > max) return;
      const text = plainText(child.string);
      if (text) {
        parts.push(text);
        length += text.length + 1;
      }
      walk(child);
    }
  };
  walk(tree);
  const s = parts.join(" ");
  return s.length > max ? `${s.slice(0, max).trimEnd()}…` : s;
}

// Code and math can hold `[[` that isn't a page reference.
const stripCode = (s: string) =>
  s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/\$\$[\s\S]+?\$\$/g, " ");

/** Pages the tree refers to with `[[…]]` or `#[[…]]`, first seen first, without the page itself. */
export function linkedPages(tree: Node, title: string, max = CARD_LINKS) {
  const self = plainText(title).toLowerCase();
  const found = new Map<string, string>();
  const walk = (n: Node) => {
    let rest = stripCode(n.string);
    for (let m = pageRef("")(rest); m && found.size < max; m = pageRef("")(rest)) {
      const name = plainText(m.groups[1]);
      const key = name.toLowerCase();
      if (name && key !== self && !found.has(key)) found.set(key, name);
      rest = rest.slice(m.index + m.length);
    }
    if (found.size < max) n.children.forEach(walk);
  };
  walk(tree);
  return [...found.values()];
}

/** Reading time at an unhurried pace, at least a minute. */
export function readMinutes(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** Changes whenever the card would look different, so chat apps fetch the new image. */
export function cardVersion(card: PreviewCard) {
  return createHash("sha256").update(JSON.stringify(card)).digest("base64url").slice(0, 12);
}

export const cardSiteName = (container: string) => `${container} · Roam Publish`;

/**
 * The Open Graph and Twitter tags for a page. `image` is the card's path (with its version); the
 * root layout's metadataBase makes both paths absolute.
 */
export function previewMetadata(card: PreviewCard, { path, image }: { path: string; image: string }): Metadata {
  const images = [{ url: image, width: 1200, height: 630, alt: card.locked ? "Protected page" : card.title }];
  if (card.locked)
    return {
      openGraph: { type: "website", title: "Protected page", siteName: cardSiteName(card.container), url: path, images },
      twitter: { card: "summary_large_image", title: "Protected page", images },
    };
  const description = card.description || undefined;
  return {
    description,
    openGraph: {
      type: "article",
      title: card.title,
      description,
      siteName: cardSiteName(card.container),
      url: path,
      images,
      publishedTime: card.publishedAt,
      modifiedTime: card.updatedAt,
      authors: card.author ? [card.author] : undefined,
      tags: card.tags.length ? card.tags : undefined,
    },
    twitter: { card: "summary_large_image", title: card.title, description, images },
    // Slack and Discord show these as extra rows under the preview.
    other: {
      "twitter:label1": "Reading time",
      "twitter:data1": `${card.minutes} min read`,
      ...(card.author ? { "twitter:label2": "Written by", "twitter:data2": card.author } : {}),
    },
  };
}
