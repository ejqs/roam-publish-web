import "server-only";
import { and, desc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { changelogEntry, graph, publication, shortlink } from "@/db/schema";
import { decryptToken } from "./append-token";
import { manageablePublications } from "./graph-access";
import type { ChangeCategory } from "./changelog-categories";
import { appendUnderBlock } from "./roam-append";

/**
 * The roam.pub change log. Every event is kept as the page's history, shown on its status page
 * (/p/{id}). It's also sent to Roam: one block per event, appended with the graph's stored
 * append-only token under the page's status link block ("Changelog" from earlier extension
 * builds). Pages without one, and graphs without a working token or with the change log off, get
 * nothing in Roam. Never blocks or fails the caller.
 *
 * Not real time in Roam: events are queued (`changelog_entry`, deduplicated), and `flushChangeLog`, run in
 * the background every few seconds, sends each page's queued entries in one call once the page has
 * been quiet for a bit, at most one call per graph every APPEND_GAP_MS, backing off on a 429.
 *
 * The owner chooses per graph which kinds of change go to Roam (`changeLogOff`), whether changes to
 * one setting in one send collapse to its final value (`changeLogMerge`, see `mergeLines`), and
 * whether entries go under one [[date]] block per day (`changeLogByDay`).
 */
export type PageRef = { graphId: string; rootUid: string };
/**
 * `key` makes an entry idempotent: one with a key already logged for this page is never appended
 * again. Without one, an entry identical to the page's previous entry is skipped.
 */
export type Change = PageRef & { category: ChangeCategory; text: string; key?: string };

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

/**
 * Text someone outside the graph chose (a collection's name, a moderator's reason), made inert for
 * Roam: no [[links]], #tags, ((refs)), {{components}} or `code`, and safe inside a [label](url).
 * Everything else in an entry is written by roam.pub itself.
 */
export function roamInert(text: string) {
  return text
    .replace(/[[\]{}`]/g, "")
    .replace(/\(\(/g, "( (")
    .replace(/\)\)/g, ") )")
    .replace(/#/g, "#\u200b")
    .replace(/\s+/g, " ")
    .trim();
}

/** `[[October 2nd, 2026]]` and `14:03`: a daily note link and the time, in the graph's time zone. */
export function stampParts(date: Date, timeZone: string | null): { day: string; time: string } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone ?? "UTC", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(date);
  } catch {
    return stampParts(date, null);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = Number(get("day"));
  return {
    day: `[[${get("month")} ${day}${ORDINAL(day)}, ${get("year")}]]`,
    time: `${get("hour")}:${get("minute")}${timeZone ? "" : " UTC"}`,
  };
}

/** `[[October 2nd, 2026]] 14:03`: a daily note link plus time, in the graph's time zone. */
export function stamp(date: Date, timeZone: string | null) {
  const { day, time } = stampParts(date, timeZone);
  return `${day} ${time}`;
}

/** Queue change log entries, after the response is sent; the background sender writes them to Roam. */
export function logChanges(changes: Change[]) {
  if (changes.length === 0) return;
  const at = new Date();
  after(() => queueChanges(changes, at).catch((e) => console.error("change log queue failed", e)));
}

export const logChange = (page: PageRef, category: ChangeCategory, text: string, key?: string) =>
  logChanges([{ ...page, category, text, key }]);

/** Log the same kind of event for pages known by publication id. */
export async function logForPublications(
  ids: string[],
  category: ChangeCategory,
  text: string | ((p: { title: string }) => string),
) {
  if (ids.length === 0) return;
  const rows = await db
    .select({ graphId: publication.graphId, rootUid: publication.rootUid, title: publication.title })
    .from(publication)
    .where(inArray(publication.id, ids));
  logChanges(
    rows.map((r) => ({ graphId: r.graphId, rootUid: r.rootUid, category, text: typeof text === "string" ? text : text(r) })),
  );
}

/**
 * Records non-duplicate entries in each page's history (pages with a status link, i.e. published
 * at least once). They're queued for Roam ("pending") when the page has a status link block and the
 * graph a usable, unpaused token, and the owner hasn't left that kind of change out; otherwise
 * they're history only ("local").
 */
export async function queueChanges(changes: Change[], at = new Date()) {
  const pairs = [...new Map(changes.map((c) => [`${c.graphId}\u0000${c.rootUid}`, c])).values()];
  const rows = await db
    .select({
      shortlinkId: shortlink.id,
      graphId: shortlink.graphId,
      rootUid: shortlink.rootUid,
      toRoam: sql<boolean>`${shortlink.anchorUid} is not null
        and ${shortlink.anchorMissingAt} is null
        and ${graph.appendTokenEnc} is not null
        and ${graph.appendTokenStatus} is distinct from 'invalid'
        and not ${graph.changeLogPaused}`,
      off: graph.changeLogOff,
    })
    .from(shortlink)
    .innerJoin(graph, eq(graph.id, shortlink.graphId))
    .where(or(...pairs.map((p) => and(eq(shortlink.graphId, p.graphId), eq(shortlink.rootUid, p.rootUid)))));
  for (const r of rows)
    await claim(
      r.shortlinkId,
      changes.filter((c) => c.graphId === r.graphId && c.rootUid === r.rootUid),
      at,
      (c) => (r.toRoam && (c.category === "moderation" || !r.off.includes(c.category)) ? "pending" : "local"),
    );
}

/** Roam doesn't publish Append API limits; stay well under what a token is likely to allow. */
const APPEND_GAP_MS = 10_000;
/** Wait for a page to go quiet so bursts (bulk edits, several changes) become one call… */
const QUIET_MS = 30_000;
/** …but never hold an entry longer than this. */
const MAX_WAIT_MS = 3 * 60_000;
/**
 * With "Merge quick changes" on, a page waits this long for its next change instead, so changes
 * made within 5 minutes of each other go out (and merge) together…
 */
export const MERGE_QUIET_MS = 5 * 60_000;
/** …held at most this long, so a page edited non-stop still gets its entries. */
const MERGE_MAX_WAIT_MS = 15 * 60_000;
/**
 * Roam's Append API writes to the daily note when the target block doesn't exist, so entries only
 * go to blocks the extension saw within this window (it checks every few minutes while Roam is
 * open). Until then they wait, and are dropped after QUEUE_MAX_AGE_MS.
 */
export const CONFIRM_WINDOW_MS = 10 * 60_000;
const QUEUE_MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const BACKOFF_BASE_MS = 60_000;
const BACKOFF_MAX_MS = 30 * 60_000;

/**
 * Sends queued entries: per graph, the page waiting longest, once it's quiet (or has waited
 * MAX_WAIT_MS; MERGE_QUIET_MS and MERGE_MAX_WAIT_MS when merging), as one Append API call. Entries are claimed atomically ("pending" → "sending"), so
 * overlapping runs or replicas never send the same entry twice.
 */
export async function flushChangeLog(now = new Date()) {
  await db
    .update(changelogEntry)
    .set({ status: "dropped" })
    .where(and(eq(changelogEntry.status, "pending"), lte(changelogEntry.createdAt, new Date(now.getTime() - QUEUE_MAX_AGE_MS))));
  const ready = await db.execute<{ shortlink_id: string; graph_id: string }>(sql`
    select distinct on (s.graph_id) s.id as shortlink_id, s.graph_id
    from ${changelogEntry} e
    join ${shortlink} s on s.id = e.shortlink_id
    join ${graph} g on g.id = s.graph_id
    where e.status = 'pending'
      and s.anchor_uid is not null
      and s.anchor_missing_at is null
      and s.anchor_confirmed_at >= ${new Date(now.getTime() - CONFIRM_WINDOW_MS)}
      and g.append_token_enc is not null
      and g.append_token_status is distinct from 'invalid'
      and not g.change_log_paused
      and (g.append_next_at is null or g.append_next_at <= ${now})
    group by s.id, s.graph_id, g.change_log_merge
    having max(e.created_at) <= case when g.change_log_merge
          then ${new Date(now.getTime() - MERGE_QUIET_MS)}::timestamptz else ${new Date(now.getTime() - QUIET_MS)}::timestamptz end
        or min(e.created_at) <= case when g.change_log_merge
          then ${new Date(now.getTime() - MERGE_MAX_WAIT_MS)}::timestamptz else ${new Date(now.getTime() - MAX_WAIT_MS)}::timestamptz end
    order by s.graph_id, min(e.created_at)
  `);
  for (const { shortlink_id, graph_id } of ready.rows) await sendPage(shortlink_id, graph_id, now);
  return ready.rows.length;
}

/**
 * Parts of an entry ("; "-joined) that say where one setting stands, so a later one replaces it.
 * `setting` parts also state a value: one matching what Roam last showed for it says nothing new.
 * Other parts are events kept as they are.
 */
const TOPICS: { re: RegExp; topic: (m: RegExpExecArray) => string; setting: boolean }[] = [
  { re: /^Access (.+?): /, topic: (m) => `access ${m[1]}`, setting: true },
  { re: /^(?:Password (.+) changed|Own password (.+) removed)$/, topic: (m) => `password ${m[1] ?? m[2]}`, setting: false },
  { re: /^(?:Encrypted with password|Encryption turned off)$/, topic: () => "encryption", setting: true },
  { re: /^Made (?:unlisted|public)/, topic: () => "visibility", setting: true },
  { re: /^(?:Shown in the graph again|Hidden from the graph)/, topic: () => "in graph", setting: true },
  { re: /^(?:Unlisted|Listed|Discoverable) in (.+)$/, topic: (m) => `listing ${m[1]}`, setting: true },
  { re: /^Byline changed to /, topic: () => "byline", setting: true },
  { re: /^Republished$/, topic: () => "republished", setting: false },
];

function topicOf(part: string) {
  for (const t of TOPICS) {
    const m = t.re.exec(part);
    if (m) return { key: t.topic(m), setting: t.setting };
  }
  return null;
}

/**
 * What each entry of one send adds to Roam, in order, or null when nothing is left of it. A send
 * holds changes made within MERGE_QUIET_MS of each other (see flushChangeLog). For each
 * setting only the last change is kept (in the entry it happened in), and dropped too when Roam's
 * change log already shows that value. `shown` is what was sent to Roam before, newest first.
 */
export function mergeLines(texts: string[], shown: string[]): (string | null)[] {
  const split = texts.map((t) => t.split("; "));
  const last = new Map<string, string>();
  split.forEach((parts, i) =>
    parts.forEach((part, j) => {
      const t = topicOf(part);
      if (t) last.set(t.key, `${i}:${j}`);
    }),
  );
  const before = new Map<string, string>();
  for (const line of shown)
    for (const part of line.split("; ").reverse()) {
      const t = topicOf(part);
      if (t?.setting && !before.has(t.key)) before.set(t.key, part);
    }
  return split.map((parts, i) => {
    const kept = parts.filter((part, j) => {
      const t = topicOf(part);
      return !t || (last.get(t.key) === `${i}:${j}` && before.get(t.key) !== part);
    });
    return kept.length ? kept.join("; ") : null;
  });
}

/** What Roam's change log under this shortlink already says, newest first. */
async function shownInRoam(shortlinkId: string) {
  const rows = await db
    .select({ text: sql<string>`coalesce(${changelogEntry.roamText}, ${changelogEntry.text})` })
    .from(changelogEntry)
    .where(and(eq(changelogEntry.shortlinkId, shortlinkId), eq(changelogEntry.status, "sent")))
    .orderBy(desc(changelogEntry.createdAt))
    .limit(200);
  return rows.map((r) => r.text);
}

async function sendPage(shortlinkId: string, graphId: string, now: Date) {
  // Pace this graph before sending, so a slow or failing call still counts toward the gap.
  const [paced] = await db
    .update(graph)
    .set({ appendNextAt: new Date(now.getTime() + APPEND_GAP_MS) })
    .where(and(eq(graph.id, graphId), or(isNull(graph.appendNextAt), lte(graph.appendNextAt, now))))
    .returning({
      name: graph.name,
      enc: graph.appendTokenEnc,
      timeZone: graph.timeZone,
      backoff: graph.appendBackoff,
      merge: graph.changeLogMerge,
      byDay: graph.changeLogByDay,
    });
  if (!paced) return; // Another run took this graph's turn.
  const link = await db.query.shortlink.findFirst({ where: eq(shortlink.id, shortlinkId) });
  const claimed = await db
    .update(changelogEntry)
    .set({ status: "sending" })
    .where(and(eq(changelogEntry.shortlinkId, shortlinkId), eq(changelogEntry.status, "pending")))
    .returning({ id: changelogEntry.id, text: changelogEntry.text, createdAt: changelogEntry.createdAt });
  const confirmed =
    link?.anchorUid &&
    !link.anchorMissingAt &&
    link.anchorConfirmedAt &&
    link.anchorConfirmedAt.getTime() >= now.getTime() - CONFIRM_WINDOW_MS;
  if (!confirmed || claimed.length === 0) {
    // Reported missing (or gone stale) since the ready check: put them back for the next confirmation.
    if (claimed.length) await db.update(changelogEntry).set({ status: "pending" }).where(inArray(changelogEntry.id, claimed.map((c) => c.id)));
    return;
  }
  claimed.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const setStatus = (ids: string[], status: "pending" | "sent" | "failed" | "merged") =>
    ids.length ? db.update(changelogEntry).set({ status }).where(inArray(changelogEntry.id, ids)) : undefined;

  const token = decryptToken(paced.enc!);
  if (!token) {
    // Encrypted with a key the server no longer has: ask the owner for a new token.
    await setStatus(claimed.map((c) => c.id), "pending");
    await db.update(graph).set({ appendTokenStatus: "invalid" }).where(eq(graph.id, graphId));
    return;
  }

  const lines = paced.merge ? mergeLines(claimed.map((c) => c.text), await shownInRoam(shortlinkId)) : claimed.map((c) => c.text);
  await setStatus(claimed.filter((_, i) => lines[i] === null).map((c) => c.id), "merged");
  // Dated when each event happened, not when it was sent; with byDay, one call per day's block.
  const groups: { day?: string; items: { id: string; line: string; text: string }[] }[] = [];
  claimed.forEach((c, i) => {
    const line = lines[i];
    if (line === null) return;
    const { day, time } = stampParts(c.createdAt, paced.timeZone);
    const text = paced.byDay ? `${time} ${line}` : `${day} ${time} ${line}`;
    const group = groups.at(-1);
    if (group && (!paced.byDay || group.day === day)) group.items.push({ id: c.id, line, text });
    else groups.push({ day: paced.byDay ? day : undefined, items: [{ id: c.id, line, text }] });
  });

  let anySent = false;
  for (const [i, group] of groups.entries()) {
    const res = await appendUnderBlock(paced.name, token, link.anchorUid!, group.items.map((it) => it.text), group.day);
    if (res.ok) {
      anySent = true;
      for (const it of group.items)
        await db.update(changelogEntry).set({ status: "sent", roamText: it.line }).where(eq(changelogEntry.id, it.id));
      continue;
    }
    if (anySent) await db.update(graph).set({ appendTokenOkAt: new Date(), appendBackoff: 0 }).where(eq(graph.id, graphId));
    await sendFailed(res, groups.slice(i).flatMap((g) => g.items.map((it) => it.id)), shortlinkId, graphId, paced.backoff, setStatus);
    return;
  }
  if (anySent) await db.update(graph).set({ appendTokenOkAt: new Date(), appendBackoff: 0 }).where(eq(graph.id, graphId));
}

async function sendFailed(
  res: { status: number; retryAfterMs?: number },
  ids: string[],
  shortlinkId: string,
  graphId: string,
  backoff: number,
  setStatus: (ids: string[], status: "pending" | "failed") => unknown,
) {
  if (res.status === 429) {
    // Not applied: keep the entries queued and back off this graph.
    await setStatus(ids, "pending");
    const wait = res.retryAfterMs ?? Math.min(BACKOFF_BASE_MS * 2 ** backoff, BACKOFF_MAX_MS);
    await db
      .update(graph)
      .set({ appendNextAt: new Date(Date.now() + wait), appendBackoff: backoff + 1 })
      .where(eq(graph.id, graphId));
    return;
  }
  if (res.status === 401 || res.status === 403) {
    // Revoked or replaced in Roam: keep the entries until the owner adds a new token.
    await setStatus(ids, "pending");
    await db.update(graph).set({ appendTokenStatus: "invalid" }).where(eq(graph.id, graphId));
    return;
  }
  // Anything else may or may not have been applied; never risk sending it twice.
  await setStatus(ids, "failed");
  if (res.status === 400) {
    // Most likely the shortlink block was deleted in Roam; the extension writes a new one on the next publish.
    await db.update(shortlink).set({ anchorUid: null }).where(eq(shortlink.id, shortlinkId));
  }
}

/**
 * Records the entries that aren't duplicates and returns them; the rest are dropped. Claims for one
 * page are serialized, so two requests can't both pass the "same as the last entry" check.
 */
async function claim(shortlinkId: string, changes: Change[], at: Date, statusOf: (c: Change) => "pending" | "local") {
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
        .values({
          shortlinkId,
          key: c.key ?? crypto.randomUUID(),
          text: c.text,
          category: c.category,
          status: statusOf(c),
          createdAt: new Date(at.getTime() + i),
        })
        .onConflictDoNothing()
        .returning({ id: changelogEntry.id, text: changelogEntry.text });
      if (!row) continue;
      claimed.push(row);
      previous = c.text;
    }
    return claimed;
  });
}

/** A page's history for its status page, newest first. */
export async function pageHistory(shortlinkId: string, limit = 100) {
  return db
    .select({ id: changelogEntry.id, text: changelogEntry.text, createdAt: changelogEntry.createdAt })
    .from(changelogEntry)
    .where(eq(changelogEntry.shortlinkId, shortlinkId))
    .orderBy(desc(changelogEntry.createdAt))
    .limit(limit);
}

export type ChangeLogStatus = { status: "ok" | "invalid" | "paused" | "none"; lastOkAt: Date | null };

/**
 * Whether the graph's change log can be written, for the extension to show: "none" without a stored
 * token, "paused" when the owner turned it off, "invalid" once Roam rejected the token, else "ok".
 */
export function changeLogStatus(g: {
  appendTokenEnc: string | null;
  appendTokenStatus: "ok" | "invalid" | null;
  appendTokenOkAt: Date | null;
  changeLogPaused: boolean;
}): ChangeLogStatus {
  const status = !g.appendTokenEnc
    ? "none"
    : g.changeLogPaused
      ? "paused"
      : g.appendTokenStatus === "invalid"
        ? "invalid"
        : "ok";
  return { status, lastOkAt: g.appendTokenOkAt };
}

export async function changeLogStatusOf(graphId: string) {
  const g = await db.query.graph.findFirst({ where: eq(graph.id, graphId) });
  return g ? changeLogStatus(g) : { status: "none" as const, lastOkAt: null };
}

/**
 * Pauses or resumes the graph's change log, keeping the token. Pausing drops what was queued:
 * changes made while paused are never logged, and it continues from when it's turned back on.
 * False when there's no stored token to resume with.
 */
export async function setChangeLogPaused(graphId: string, paused: boolean) {
  const [g] = await db
    .update(graph)
    .set({ changeLogPaused: paused })
    .where(and(eq(graph.id, graphId), isNotNull(graph.appendTokenEnc)))
    .returning({ id: graph.id });
  if (!g) return false;
  if (paused)
    await db
      .update(changelogEntry)
      .set({ status: "dropped" })
      .where(
        and(
          eq(changelogEntry.status, "pending"),
          inArray(changelogEntry.shortlinkId, db.select({ id: shortlink.id }).from(shortlink).where(eq(shortlink.graphId, graphId))),
        ),
      );
  return true;
}

export type AnchorCheck = { rootUid: string; anchorUid: string };

/**
 * What the extension saw in the graph: Changelog blocks that still exist are confirmed, so queued
 * entries can go to them; missing ones stop the page's change log, drop what was queued for it (it
 * continues from when the blocks are added back, never backfilled) and show up on the dashboard.
 * Only reports about the block roam.pub currently writes to count.
 */
export async function recordAnchorCheck(graphId: string, present: AnchorCheck[], missing: AnchorCheck[]) {
  const now = new Date();
  const match = (list: AnchorCheck[]) =>
    or(...list.map((a) => and(eq(shortlink.rootUid, a.rootUid), eq(shortlink.anchorUid, a.anchorUid))));
  if (present.length)
    await db
      .update(shortlink)
      .set({ anchorConfirmedAt: now })
      .where(and(eq(shortlink.graphId, graphId), match(present)));
  if (missing.length) {
    const gone = await db
      .update(shortlink)
      .set({ anchorUid: null, anchorConfirmedAt: null, anchorMissingAt: now, anchorMissingDismissedAt: null })
      .where(and(eq(shortlink.graphId, graphId), match(missing)))
      .returning({ id: shortlink.id });
    if (gone.length)
      await db
        .update(changelogEntry)
        .set({ status: "dropped" })
        .where(and(inArray(changelogEntry.shortlinkId, gone.map((g) => g.id)), eq(changelogEntry.status, "pending")));
  }
}

/** Pages this person manages whose Changelog block went missing, not dismissed: for the dashboard. */
export async function missingChangeLogBlocks(userId: string) {
  return db
    .select({
      shortlinkId: shortlink.id,
      title: publication.title,
      rootUid: publication.rootUid,
      graphName: graph.name,
      missingAt: shortlink.anchorMissingAt,
    })
    .from(shortlink)
    .innerJoin(
      publication,
      and(eq(publication.graphId, shortlink.graphId), eq(publication.rootUid, shortlink.rootUid)),
    )
    .innerJoin(graph, eq(graph.id, shortlink.graphId))
    .where(
      and(
        isNotNull(shortlink.anchorMissingAt),
        isNull(shortlink.anchorMissingDismissedAt),
        manageablePublications(userId),
      ),
    )
    .orderBy(desc(shortlink.anchorMissingAt));
}
