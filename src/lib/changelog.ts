import { and, desc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { changelogEntry, graph, publication, shortlink } from "@/db/schema";
import { decryptToken } from "./append-token";
import { appendUnderBlock } from "./roam-append";

/**
 * The roam.pub change log: one block per event, appended with the graph's stored append-only token
 * under the "Changelog" block of the page's shortlink block in Roam. Pages without a shortlink block,
 * and graphs without a working token, get nothing. Never blocks or fails the caller.
 *
 * Not real time: events are queued (`changelog_entry`, deduplicated), and `flushChangeLog`, run in
 * the background every few seconds, sends each page's queued entries in one call once the page has
 * been quiet for a bit, at most one call per graph every APPEND_GAP_MS, backing off on a 429.
 */
export type PageRef = { graphId: string; rootUid: string };
/**
 * `key` makes an entry idempotent: one with a key already logged for this page is never appended
 * again. Without one, an entry identical to the page's previous entry is skipped.
 */
export type Change = PageRef & { text: string; key?: string };

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

/** Queue change log entries, after the response is sent; the background sender writes them to Roam. */
export function logChanges(changes: Change[]) {
  if (changes.length === 0) return;
  const at = new Date();
  after(() => queueChanges(changes, at).catch((e) => console.error("change log queue failed", e)));
}

export const logChange = (page: PageRef, text: string, key?: string) => logChanges([{ ...page, text, key }]);

/** Log the same kind of event for pages known by publication id. */
export async function logForPublications(ids: string[], text: string | ((p: { title: string }) => string)) {
  if (ids.length === 0) return;
  const rows = await db
    .select({ graphId: publication.graphId, rootUid: publication.rootUid, title: publication.title })
    .from(publication)
    .where(inArray(publication.id, ids));
  logChanges(rows.map((r) => ({ graphId: r.graphId, rootUid: r.rootUid, text: typeof text === "string" ? text : text(r) })));
}

/** Records non-duplicate entries for pages that have a shortlink block and a usable token. */
export async function queueChanges(changes: Change[], at = new Date()) {
  const pairs = [...new Map(changes.map((c) => [`${c.graphId}\u0000${c.rootUid}`, c])).values()];
  const rows = await db
    .select({ shortlinkId: shortlink.id, graphId: shortlink.graphId, rootUid: shortlink.rootUid })
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
  for (const r of rows)
    await claim(r.shortlinkId, changes.filter((c) => c.graphId === r.graphId && c.rootUid === r.rootUid), at);
}

/** Roam doesn't publish Append API limits; stay well under what a token is likely to allow. */
const APPEND_GAP_MS = 10_000;
/** Wait for a page to go quiet so bursts (bulk edits, several changes) become one call… */
const QUIET_MS = 30_000;
/** …but never hold an entry longer than this. */
const MAX_WAIT_MS = 3 * 60_000;
const BACKOFF_BASE_MS = 60_000;
const BACKOFF_MAX_MS = 30 * 60_000;

/**
 * Sends queued entries: per graph, the page waiting longest, once it's quiet (or has waited
 * MAX_WAIT_MS), as one Append API call. Entries are claimed atomically ("pending" → "sending"), so
 * overlapping runs or replicas never send the same entry twice.
 */
export async function flushChangeLog(now = new Date()) {
  const ready = await db.execute<{ shortlink_id: string; graph_id: string }>(sql`
    select distinct on (s.graph_id) s.id as shortlink_id, s.graph_id
    from ${changelogEntry} e
    join ${shortlink} s on s.id = e.shortlink_id
    join ${graph} g on g.id = s.graph_id
    where e.status = 'pending'
      and s.anchor_uid is not null
      and g.append_token_enc is not null
      and g.append_token_status is distinct from 'invalid'
      and (g.append_next_at is null or g.append_next_at <= ${now})
    group by s.id, s.graph_id
    having max(e.created_at) <= ${new Date(now.getTime() - QUIET_MS)}
        or min(e.created_at) <= ${new Date(now.getTime() - MAX_WAIT_MS)}
    order by s.graph_id, min(e.created_at)
  `);
  for (const { shortlink_id, graph_id } of ready.rows) await sendPage(shortlink_id, graph_id, now);
}

async function sendPage(shortlinkId: string, graphId: string, now: Date) {
  // Pace this graph before sending, so a slow or failing call still counts toward the gap.
  const [paced] = await db
    .update(graph)
    .set({ appendNextAt: new Date(now.getTime() + APPEND_GAP_MS) })
    .where(and(eq(graph.id, graphId), or(isNull(graph.appendNextAt), lte(graph.appendNextAt, now))))
    .returning({ name: graph.name, enc: graph.appendTokenEnc, timeZone: graph.timeZone, backoff: graph.appendBackoff });
  if (!paced) return; // Another run took this graph's turn.
  const link = await db.query.shortlink.findFirst({ where: eq(shortlink.id, shortlinkId) });
  const claimed = await db
    .update(changelogEntry)
    .set({ status: "sending" })
    .where(and(eq(changelogEntry.shortlinkId, shortlinkId), eq(changelogEntry.status, "pending")))
    .returning({ id: changelogEntry.id, text: changelogEntry.text, createdAt: changelogEntry.createdAt });
  if (!link?.anchorUid || claimed.length === 0) return;
  claimed.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const ids = claimed.map((c) => c.id);
  const setStatus = (status: "pending" | "sent" | "failed") =>
    db.update(changelogEntry).set({ status }).where(inArray(changelogEntry.id, ids));

  const token = decryptToken(paced.enc!);
  if (!token) {
    // Encrypted with a key the server no longer has: ask the owner for a new token.
    await setStatus("pending");
    await db.update(graph).set({ appendTokenStatus: "invalid" }).where(eq(graph.id, graphId));
    return;
  }
  // Dated when each event happened, not when it was sent.
  const res = await appendUnderBlock(
    paced.name,
    token,
    link.anchorUid,
    claimed.map((c) => `${stamp(c.createdAt, paced.timeZone)} ${c.text}`),
  );
  if (res.ok) {
    await setStatus("sent");
    await db.update(graph).set({ appendTokenOkAt: new Date(), appendBackoff: 0 }).where(eq(graph.id, graphId));
    return;
  }
  if (res.status === 429) {
    // Not applied: keep the entries queued and back off this graph.
    await setStatus("pending");
    const wait = res.retryAfterMs ?? Math.min(BACKOFF_BASE_MS * 2 ** paced.backoff, BACKOFF_MAX_MS);
    await db
      .update(graph)
      .set({ appendNextAt: new Date(Date.now() + wait), appendBackoff: paced.backoff + 1 })
      .where(eq(graph.id, graphId));
    return;
  }
  if (res.status === 401 || res.status === 403) {
    // Revoked or replaced in Roam: keep the entries until the owner adds a new token.
    await setStatus("pending");
    await db.update(graph).set({ appendTokenStatus: "invalid" }).where(eq(graph.id, graphId));
    return;
  }
  // Anything else may or may not have been applied; never risk sending it twice.
  await setStatus("failed");
  if (res.status === 400) {
    // Most likely the shortlink block was deleted in Roam; the extension writes a new one on the next publish.
    await db.update(shortlink).set({ anchorUid: null }).where(eq(shortlink.id, shortlinkId));
  }
}

/**
 * Records the entries that aren't duplicates and returns them; the rest are dropped. Claims for one
 * page are serialized, so two requests can't both pass the "same as the last entry" check.
 */
async function claim(shortlinkId: string, changes: Change[], at: Date) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${shortlinkId}))`);
    const [last] = await tx
      .select({ text: changelogEntry.text })
      .from(changelogEntry)
      .where(eq(changelogEntry.shortlinkId, shortlinkId))
      .orderBy(desc(changelogEntry.createdAt))
      .limit(1);
    let previous = last?.text;
    const claimed: { id: string; text: string }[] = [];
    for (const [i, c] of changes.entries()) {
      if (!c.key && c.text === previous) continue;
      const [row] = await tx
        .insert(changelogEntry)
        // Distinct timestamps keep "the last entry" well defined within one batch.
        .values({ shortlinkId, key: c.key ?? crypto.randomUUID(), text: c.text, createdAt: new Date(at.getTime() + i) })
        .onConflictDoNothing()
        .returning({ id: changelogEntry.id, text: changelogEntry.text });
      if (!row) continue;
      claimed.push(row);
      previous = c.text;
    }
    return claimed;
  });
}

export type ChangeLogStatus = { status: "ok" | "invalid" | "none"; lastOkAt: Date | null };

/** Whether the graph's change log can be written, for the extension to show. */
export function changeLogStatus(g: {
  appendTokenEnc: string | null;
  appendTokenStatus: "ok" | "invalid" | null;
  appendTokenOkAt: Date | null;
}): ChangeLogStatus {
  const status = g.appendTokenStatus === "invalid" ? "invalid" : g.appendTokenEnc ? "ok" : "none";
  return { status, lastOkAt: g.appendTokenOkAt };
}

export async function changeLogStatusOf(graphId: string) {
  const g = await db.query.graph.findFirst({ where: eq(graph.id, graphId) });
  return g ? changeLogStatus(g) : { status: "none" as const, lastOkAt: null };
}
