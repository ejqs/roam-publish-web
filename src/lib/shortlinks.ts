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

/** Records the Roam block the extension wrote the shortlink into; the change log nests under it. */
export async function setAnchor(graphId: string, rootUid: string, anchorUid: string | null) {
  await db
    .update(shortlink)
    .set({ anchorUid })
    .where(and(eq(shortlink.graphId, graphId), eq(shortlink.rootUid, rootUid)));
}

/** "{server}/p/{id}" at the start of a block, as the extension writes it. Same rule as the extension. */
const LEADING = /^https?:\/\/\S+?\/p\/([2-9A-HJ-NP-Za-km-z]{8})(?=\s|$)/;

/**
 * Drops shortlink blocks (and the change log under them) of the given ids, at any depth, embeds
 * included. The extension already leaves them out; this covers trees sent by builds that don't, and
 * shortlink blocks of blocks published from inside this page that the extension didn't know about.
 */
export function withoutShortlinks(tree: Node, ids: Set<string>): Node {
  if (ids.size === 0) return tree;
  const strip = (n: Node): Node => ({
    ...n,
    ...(n.embed && { embed: strip(n.embed) }),
    children: n.children
      .filter((c) => {
        const m = LEADING.exec(c.string);
        return !(m && ids.has(m[1]));
      })
      .map(strip),
  });
  return strip(tree);
}

/** Every shortlink id in a graph. */
export async function shortlinkIds(graphId: string) {
  const rows = await db.select({ id: shortlink.id }).from(shortlink).where(eq(shortlink.graphId, graphId));
  return new Set(rows.map((r) => r.id));
}
