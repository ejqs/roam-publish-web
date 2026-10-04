import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { type Node, shortlink } from "@/db/schema";
import { randomId } from "./random-id";

/** No 0/O, 1/I/l: readable when typed or pasted. 58⁸ ≈ 1.3×10¹⁴ ids. */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const LENGTH = 8;
export const SHORT_ID = /^[2-9A-HJ-NP-Za-km-z]{8}$/;

export function shortUrl(id: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/p/${id}`;
}

/**
 * The page's permanent /p/{id}, created on first use. Stable per graph + Roam uid, across
 * unpublishing and republishing. A new id that collides with an existing one is retried.
 */
export async function ensureShortlink(graphId: string, rootUid: string, gen = () => randomId(ALPHABET, LENGTH)) {
  const where = and(eq(shortlink.graphId, graphId), eq(shortlink.rootUid, rootUid));
  const existing = await db.query.shortlink.findFirst({ where });
  if (existing) return existing;
  for (let i = 0; i < 5; i++) {
    const [row] = await db.insert(shortlink).values({ id: gen(), graphId, rootUid }).onConflictDoNothing().returning();
    if (row) return row;
    // Either the id collided or another request created this page's link first.
    const raced = await db.query.shortlink.findFirst({ where });
    if (raced) return raced;
  }
  throw new Error("Couldn't find a free shortlink id");
}

/**
 * Records the Changelog block the extension just found or wrote, which also confirms it exists and
 * clears a "block missing" issue: the change log continues from now on.
 */
export async function setAnchor(graphId: string, rootUid: string, anchorUid: string) {
  await db
    .update(shortlink)
    .set({ anchorUid, anchorConfirmedAt: new Date(), anchorMissingAt: null, anchorMissingDismissedAt: null })
    .where(and(eq(shortlink.graphId, graphId), eq(shortlink.rootUid, rootUid)));
}

/**
 * "{server}/p/{id}" at the start of a block, bare or as `[text]({server}/p/{id})`, as the extension
 * writes it. Same rule as the extension's `isShortlinkText`.
 */
const LEADING = /^(?:\[[^\]\n]*\]\()?https?:\/\/[^\s)]+?\/p\/([2-9A-HJ-NP-Za-km-z]{8})(?=[\s)]|$)/;

/**
 * Drops shortlink blocks, with everything under them, at any depth, embeds included. A shortlink
 * block is "{tag}" with the "[{text}]({server}/p/{id})" block and the change log under it. A block
 * goes when its own text starts with a known shortlink, or when one of its children's does and one
 * of its children is a recorded Changelog block (the link block itself, or, from earlier builds, a
 * separate "Changelog" block next to it). A status link pasted under an ordinary block drops only
 * that link, not the block it's under. The extension already leaves them out; this covers trees
 * sent by builds that don't, and shortlink blocks of blocks published from inside this page that
 * the extension didn't know about. Same rule as the extension's `isShortlinkBlock`.
 */
export function withoutShortlinks(tree: Node, { ids, anchors }: ShortlinkSet): Node {
  if (ids.size === 0) return tree;
  const isLink = (text: string) => {
    const m = LEADING.exec(text);
    return !!m && ids.has(m[1]);
  };
  const isShortlinkBlock = (c: Node) =>
    isLink(c.string) || (c.children.some((g) => isLink(g.string)) && c.children.some((g) => anchors.has(g.uid)));
  const strip = (n: Node): Node => ({
    ...n,
    ...(n.embed && { embed: strip(n.embed) }),
    ...(n.moreEmbeds && { moreEmbeds: n.moreEmbeds.map(strip) }),
    children: n.children.filter((c) => !isShortlinkBlock(c)).map(strip),
  });
  return strip(tree);
}

export type ShortlinkSet = { ids: Set<string>; anchors: Set<string> };

/** Every shortlink id in a graph, and the uids of the Changelog blocks they nest under in Roam. */
export async function shortlinkSet(graphId: string): Promise<ShortlinkSet> {
  const rows = await db
    .select({ id: shortlink.id, anchorUid: shortlink.anchorUid })
    .from(shortlink)
    .where(eq(shortlink.graphId, graphId));
  return {
    ids: new Set(rows.map((r) => r.id)),
    anchors: new Set(rows.flatMap((r) => (r.anchorUid ? [r.anchorUid] : []))),
  };
}
