import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { graph, publication, shortlink } from "@/db/schema";
import { decryptToken } from "./append-token";
import { appendUnderBlock } from "./roam-append";

/**
 * The roam.pub change log: one block per event, appended with the graph's stored append-only token
 * under the page's shortlink block in Roam ("{shortUrl} #published"). Pages without a shortlink
 * block, and graphs without a working token, get nothing. Never blocks or fails the caller.
 */
export type PageRef = { graphId: string; rootUid: string };
export type Change = PageRef & { text: string };

const ORDINAL = (d: number) =>
  d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";

export function validTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** `[[October 2nd, 2026]] 14:03`: a daily note link plus time, in the graph's time zone. */
export function stamp(date: Date, timeZone: string | null) {
  const tz = timeZone ?? "UTC";
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(date);
  } catch {
    return stamp(date, "UTC");
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = Number(get("day"));
  return `[[${get("month")} ${day}${ORDINAL(day)}, ${get("year")}]] ${get("hour")}:${get("minute")}${timeZone ? "" : " UTC"}`;
}

/** Queue change log entries; they're written after the response is sent. */
export function logChanges(changes: Change[]) {
  if (changes.length === 0) return;
  const at = new Date();
  after(() => writeChanges(changes, at).catch((e) => console.error("change log failed", e)));
}

export const logChange = (page: PageRef, text: string) => logChanges([{ ...page, text }]);

/** Log the same kind of event for pages known by publication id. */
export async function logForPublications(ids: string[], text: string | ((p: { title: string }) => string)) {
  if (ids.length === 0) return;
  const rows = await db
    .select({ graphId: publication.graphId, rootUid: publication.rootUid, title: publication.title })
    .from(publication)
    .where(inArray(publication.id, ids));
  logChanges(rows.map((r) => ({ graphId: r.graphId, rootUid: r.rootUid, text: typeof text === "string" ? text : text(r) })));
}

export async function writeChanges(changes: Change[], at = new Date()) {
  const pairs = [...new Map(changes.map((c) => [`${c.graphId}\u0000${c.rootUid}`, c])).values()];
  const rows = await db
    .select({
      graphId: graph.id,
      graphName: graph.name,
      token: graph.appendTokenEnc,
      timeZone: graph.timeZone,
      rootUid: shortlink.rootUid,
      anchorUid: shortlink.anchorUid,
    })
    .from(shortlink)
    .innerJoin(graph, eq(graph.id, shortlink.graphId))
    .where(
      and(
        isNotNull(shortlink.anchorUid),
        isNotNull(graph.appendTokenEnc),
        sql`${graph.appendTokenStatus} is distinct from 'invalid'`,
        or(...pairs.map((p) => and(eq(shortlink.graphId, p.graphId), eq(shortlink.rootUid, p.rootUid)))),
      ),
    );

  const rejected = new Set<string>();
  for (const r of rows) {
    if (rejected.has(r.graphId)) continue;
    const texts = changes
      .filter((c) => c.graphId === r.graphId && c.rootUid === r.rootUid)
      .map((c) => `${stamp(at, r.timeZone)} ${c.text}`);
    const token = decryptToken(r.token!);
    if (!token) continue;
    const res = await appendUnderBlock(r.graphName, token, r.anchorUid!, texts);
    if (res.ok) continue;
    if (res.status === 401 || res.status === 403) {
      // Revoked or replaced in Roam: stop until the owner adds a new one.
      rejected.add(r.graphId);
      await db.update(graph).set({ appendTokenStatus: "invalid" }).where(eq(graph.id, r.graphId));
      continue;
    }
    if (res.status === 400) {
      // Most likely the shortlink block was deleted in Roam; the extension writes a new one on the next publish.
      await db
        .update(shortlink)
        .set({ anchorUid: null })
        .where(and(eq(shortlink.graphId, r.graphId), eq(shortlink.rootUid, r.rootUid)));
    }
  }
}
