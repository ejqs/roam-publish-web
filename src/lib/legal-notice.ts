import { and, gt, like } from "drizzle-orm";
import { db } from "@/db";
import { announcement } from "@/db/schema";
import { forgetAnnouncements } from "./announcements";
import { type LegalPage, type LegalTimes, legalTimes } from "./last-updated";

/**
 * Tells signed-in people on the site when the Terms or Privacy policy change: an info banner they
 * can dismiss, for two weeks, instead of an email for every edit. src/instrumentation.ts runs it
 * when a deploy boots.
 *
 * Each version of the pages' commit times gets its own auto announcement row, keyed `legal:` plus
 * those times, so a deploy that changes nothing finds its row and does nothing, and the rows left
 * behind remember what was last announced. The very first time there's nothing to compare with,
 * so it only records the current version.
 */
export const LEGAL_NOTICE_MS = 14 * 24 * 60 * 60_000;
const PREFIX = "legal:";

const NAMES: Record<LegalPage, string> = { terms: "Terms", privacy: "Privacy policy" };

export const legalKey = (times: LegalTimes) =>
  PREFIX + JSON.stringify({ terms: times.terms ?? null, privacy: times.privacy ?? null });

const timesOf = (key: string): LegalTimes => {
  try {
    return JSON.parse(key.slice(PREFIX.length)) as LegalTimes;
  } catch {
    return {};
  }
};

/**
 * What a deploy with `times` should do, given the legal rows already there: nothing, record it
 * quietly, or announce the pages that changed since the newest one. Only a page that moved forward
 * counts, so rolling back a deploy announces nothing.
 */
export function legalNotice(
  times: LegalTimes,
  rows: { key: string | null; startsAt: Date }[],
): { kind: "none" } | { kind: "record" } | { kind: "announce"; pages: LegalPage[] } {
  if (!times.terms && !times.privacy) return { kind: "none" };
  const key = legalKey(times);
  const previous = rows.filter((r) => r.key?.startsWith(PREFIX));
  if (previous.some((r) => r.key === key)) return { kind: "none" };
  const last = previous.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())[0];
  if (!last) return { kind: "record" };
  const before = timesOf(last.key!);
  const pages = (Object.keys(NAMES) as LegalPage[]).filter((p) => {
    const now = times[p];
    const then = before[p];
    return now && (!then || now > then);
  });
  return pages.length ? { kind: "announce", pages } : { kind: "record" };
}

export function legalMessage(pages: LegalPage[]) {
  const names = pages.map((p) => NAMES[p]);
  return {
    message: `We've updated our ${names.join(" and ")}.`,
    // One link only: the Terms when both changed, since they point to the Privacy policy.
    linkUrl: `/${pages[0]}`,
    linkText: pages.length > 1 ? "Read the changes" : "Read it",
  };
}

export async function announceLegalChanges(now = new Date()) {
  const times = legalTimes();
  const rows = await db
    .select({ key: announcement.key, startsAt: announcement.startsAt })
    .from(announcement)
    .where(like(announcement.key, `${PREFIX}%`));
  const todo = legalNotice(times, rows);
  if (todo.kind === "none") return;
  const key = legalKey(times);
  const base = { source: "auto" as const, key, tone: "info" as const, audience: "signed-in" as const, startsAt: now, updatedAt: now };
  await db.transaction(async (tx) => {
    if (todo.kind === "announce")
      // The newer notice replaces one still up.
      await tx
        .update(announcement)
        .set({ endsAt: now, updatedAt: now })
        .where(and(like(announcement.key, `${PREFIX}%`), gt(announcement.endsAt, now)));
    await tx
      .insert(announcement)
      .values(
        todo.kind === "announce"
          ? { ...base, ...legalMessage(todo.pages), endsAt: new Date(now.getTime() + LEGAL_NOTICE_MS) }
          : { ...base, message: "Terms and Privacy policy dates recorded.", endsAt: now },
      )
      // Another replica booting the same deploy got there first.
      .onConflictDoNothing({ target: announcement.key });
  });
  forgetAnnouncements();
}
