import type { Node } from "@/db/schema";
import { BARE_TAG, pageRef } from "./roam-refs";
import { plainText } from "./slug";

/**
 * Tags and search text are worked out here from the published tree, never sent by the extension, so
 * they stay outside the content hash and older extensions get them for free.
 */

export const MAX_TAGS = 50;
const MAX_TAG_LENGTH = 100;
/** Postgres caps a tsvector at 1 MB; long pages are indexed up to here. */
const MAX_SEARCH_TEXT = 200_000;

/** How tags are stored and matched: trimmed, single-spaced, lowercase. */
export function normalizeTag(t: string) {
  const s = t.replace(/\s+/g, " ").trim().toLowerCase();
  return s.length > 0 && s.length <= MAX_TAG_LENGTH && !s.startsWith(".") ? s : null;
}

// Code, math and {{components}} can hold `#` that isn't a tag.
const strip = (s: string) =>
  s
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/\$\$[\s\S]+?\$\$/g, " ")
    .replace(/\{\{((?:[^{}]|\{[^{}]*\})*)\}\}/g, " ");

/** `#[[a b]]` and `#tag` in a block's text. */
function hashTags(text: string, out: string[]) {
  let rest = strip(text);
  for (;;) {
    const bracket = pageRef("#")(rest);
    const bare = BARE_TAG.exec(rest);
    const m = bracket && (!bare || bracket.index <= bare.index) ? bracket : bare && { index: bare.index, length: bare[0].length, groups: [...bare] };
    if (!m) return;
    out.push(m.groups[1]);
    rest = rest.slice(m.index + m.length);
  }
}

/** The values of a `Tags:: …` attribute: page refs, hashtags, or plain comma-separated words. */
function attributeValues(value: string, out: string[]) {
  const before = out.length;
  let rest = strip(value);
  for (;;) {
    const m = pageRef("")(rest);
    if (!m) break;
    out.push(m.groups[1]);
    rest = rest.slice(0, m.index) + " " + rest.slice(m.index + m.length);
  }
  hashTags(rest, out);
  if (out.length === before) out.push(...rest.split(",").map((v) => plainText(v)));
}

const TAGS_ATTRIBUTE = /^\s*(?:\[\[)?tags(?:\]\])?::\s*([\s\S]*)$/i;

/** Tags on a published page or block, in first-seen order. Embedded content belongs to its own page. */
export function extractTags(tree: Node): string[] {
  const found: string[] = [];
  const walk = (n: Node) => {
    const attr = TAGS_ATTRIBUTE.exec(n.string);
    if (attr) {
      attributeValues(attr[1], found);
      // Roam also lets an attribute's values sit in its children.
      for (const c of n.children) attributeValues(c.string, found);
    }
    hashTags(n.string, found);
    n.children.forEach(walk);
  };
  walk(tree);
  const tags = new Set<string>();
  for (const t of found) {
    const n = normalizeTag(t);
    if (n) tags.add(n);
    if (tags.size >= MAX_TAGS) break;
  }
  return [...tags];
}

/** Plain text of every block, for full-text search. The title is indexed separately. */
export function searchText(tree: Node) {
  const parts: string[] = [];
  let size = 0;
  const walk = (n: Node) => {
    if (size > MAX_SEARCH_TEXT) return;
    const t = plainText(n.string);
    if (t) {
      parts.push(t);
      size += t.length + 1;
    }
    n.children.forEach(walk);
  };
  walk(tree);
  return parts.join("\n").slice(0, MAX_SEARCH_TEXT);
}

export type TagEdits = { tagsAdded: string[]; tagsHidden: string[] };

/** Tags from the Roam text, plus those added on the website, minus those hidden there. */
export function effectiveTags(roamTags: string[], edits?: TagEdits) {
  if (!edits) return roamTags.slice(0, MAX_TAGS);
  const hidden = new Set(edits.tagsHidden);
  return [...new Set([...roamTags, ...edits.tagsAdded])].filter((t) => !hidden.has(t)).slice(0, MAX_TAGS);
}

/** Both derived fields, for writing alongside a tree. Website tag edits, when given, are reapplied. */
export const indexFields = (tree: Node, edits?: TagEdits) => ({
  tags: effectiveTags(extractTags(tree), edits),
  searchText: searchText(tree),
});
