import { and, ilike, or, type SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { publication } from "@/db/schema";

/** SQL pieces for searching and tag-filtering publications; every list and /search shares them. */

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Each word of the search as a prefix, all required: "spaced rep" finds "spaced repetition". */
function tsQuery(q: string): SQL | null {
  const words = (q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);
  return words.length ? sql`to_tsquery('simple', ${words.map((w) => `${w}:*`).join(" & ")})` : null;
}

/**
 * Where a page's text (not just its title) may be searched and excerpted: pages the reader can open.
 * Listed protected pages show their titles, so they still match on those, but never on their text.
 * Undefined means every page in the list.
 */
export type BodyVisible = SQL | undefined;

/** Title or text matches the search. Titles also match on any substring, for punctuation and partial words. */
export function textMatch(q: string, bodyVisible?: BodyVisible): SQL | undefined {
  if (!q) return undefined;
  const ts = tsQuery(q);
  const title = ilike(publication.title, `%${escapeLike(q)}%`);
  return ts ? or(and(bodyVisible, sql`${publication.search} @@ ${ts}`), title) : title;
}

const textArray = (values: string[]) =>
  sql`array[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;

/** Has every one of the tags. */
export const tagsMatch = (tags: string[]): SQL | undefined =>
  tags.length ? sql`${publication.tags} @> ${textArray(tags)}` : undefined;

/** Has at least one of the tags. */
export const tagsOverlap = (tags: string[]): SQL => (tags.length ? sql`${publication.tags} && ${textArray(tags)}` : sql`false`);

export const listWhere = (
  s: { q: string; tags: string[]; kind: string | null },
  bodyVisible: BodyVisible,
  ...rest: (SQL | undefined)[]
) => and(...rest, textMatch(s.q, bodyVisible), tagsMatch(s.tags), s.kind ? sql`${publication.kind} = ${s.kind}` : undefined);

/** Best match first: title hits outrank body hits. */
export function relevance(q: string, bodyVisible?: BodyVisible) {
  const ts = tsQuery(q);
  const titleHit = sql`(${publication.title} ilike ${`%${escapeLike(q)}%`})::int`;
  if (!ts) return titleHit;
  const rank = sql`ts_rank(${publication.search}, ${ts})`;
  return sql`${titleHit} + ${bodyVisible ? sql`case when ${bodyVisible} then ${rank} else 0 end` : rank}`;
}

// Roam text never holds these control characters, so they mark the hits unambiguously.
export const HIT_START = "\u0001";
export const HIT_END = "\u0002";

/** A short excerpt around the first hit in the text, hits wrapped in HIT_START/HIT_END. */
export function snippet(q: string, bodyVisible?: BodyVisible) {
  const ts = tsQuery(q);
  if (!ts) return sql<string | null>`null`;
  const opts = `StartSel=${HIT_START}, StopSel=${HIT_END}, MaxWords=24, MinWords=10, MaxFragments=1, FragmentDelimiter=" … "`;
  const hit = sql`to_tsvector('simple', ${publication.searchText}) @@ ${ts}`;
  return sql<string | null>`case when ${bodyVisible ? and(bodyVisible, hit) : hit}
    then ts_headline('simple', ${publication.searchText}, ${ts}, ${opts}) end`;
}

/** Splits a snippet into plain and hit parts for rendering. */
export function snippetParts(s: string | null): { text: string; hit: boolean }[] | undefined {
  if (!s || !s.includes(HIT_START)) return undefined;
  return s
    .split(HIT_START)
    .flatMap((chunk, i) => {
      if (i === 0) return [{ text: chunk, hit: false }];
      const [hit, rest = ""] = chunk.split(HIT_END);
      return [
        { text: hit, hit: true },
        { text: rest, hit: false },
      ];
    })
    .filter((p) => p.text);
}

export type TagCount = { tag: string; n: number };

/**
 * The most used tags among the rows `from … where …` selects, most used first. `from` must
 * bring in `publication` by its own name.
 */
export async function tagCounts(from: SQL, where: SQL | undefined, limit = 12): Promise<TagCount[]> {
  const r = await db.execute<{ tag: string; n: number }>(sql`
    select t as tag, count(*)::int as n ${from}, unnest(${publication.tags}) as t
    ${where ? sql`where ${where}` : sql``}
    group by t order by n desc, t limit ${limit}`);
  return r.rows;
}
