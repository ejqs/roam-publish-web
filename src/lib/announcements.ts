import "server-only";
import { and, eq, gt, lte } from "drizzle-orm";
import { db } from "@/db";
import { announcement, type AnnouncementAudience, type AnnouncementTone } from "@/db/schema";
import { dismissible, dismissId } from "./announcement-shared";

export { DISMISS_COOKIE, dismissible, dismissId, MESSAGE_MAX } from "./announcement-shared";

/**
 * The site-wide banner: urgent things only (downtime, an outage, something people must act on), plus
 * an info notice when the Terms or Privacy policy change (lib/legal-notice.ts).
 * Admins post manual ones from /admin/announcement; the status-banner job posts auto ones
 * (lib/status-banner.ts). At most one shows at a time.
 */

export type Announcement = typeof announcement.$inferSelect;

const TONE_RANK = { info: 0, warning: 2, critical: 4 } as const;
const rank = (a: Announcement) => TONE_RANK[a.tone] + (a.source === "manual" ? 1 : 0);

/**
 * The one banner to show: live, not muted, for this audience, not dismissed. Critical beats warning
 * beats info;
 * at the same tone an admin's beats an automatic one; then the newest.
 */
export function pickAnnouncement(
  rows: Announcement[],
  { signedIn, dismissed, now = new Date() }: { signedIn: boolean; dismissed?: string | null; now?: Date },
) {
  const live = rows.filter(
    (a) =>
      a.startsAt <= now &&
      a.endsAt > now &&
      !(a.mutedUntil && a.mutedUntil > now) &&
      (a.audience === "everyone" || signedIn) &&
      !(dismissible(a) && dismissed === dismissId(a)),
  );
  live.sort((a, b) => rank(b) - rank(a) || b.startsAt.getTime() - a.startsAt.getTime());
  return live[0] ?? null;
}

/** Rows are read at most this often per process: the banner sits on every page. */
const MEMO_MS = 30_000;
let memo: { at: number; rows: Announcement[] } | null = null;

/** Announcements live now (muted ones included; pickAnnouncement leaves those out). */
export async function liveAnnouncements(now = new Date()) {
  if (memo && now.getTime() - memo.at < MEMO_MS && now.getTime() >= memo.at) return memo.rows;
  const rows = await db
    .select()
    .from(announcement)
    .where(and(lte(announcement.startsAt, now), gt(announcement.endsAt, now)));
  memo = { at: now.getTime(), rows };
  return rows;
}

/** After a change in this process, so the admin sees it at once. Other processes catch up in 30 s. */
export const forgetAnnouncements = () => void (memo = null);

export type NewAnnouncement = {
  tone: AnnouncementTone;
  message: string;
  linkUrl?: string | null;
  linkText?: string | null;
  audience: AnnouncementAudience;
  endsAt: Date;
  createdBy: string;
};

/** Posts a manual announcement. It replaces any manual one still up: they never stack. */
export async function postAnnouncement(input: NewAnnouncement, now = new Date()) {
  const row = await db.transaction(async (tx) => {
    await tx
      .update(announcement)
      .set({ endsAt: now, updatedAt: now })
      .where(and(eq(announcement.source, "manual"), gt(announcement.endsAt, now)));
    const [created] = await tx
      .insert(announcement)
      .values({ ...input, source: "manual", startsAt: now, updatedAt: now })
      .returning();
    return created;
  });
  forgetAnnouncements();
  return row;
}

/** Takes a banner down now. An auto one comes back if its problem is still there on the next run. */
export async function endAnnouncement(id: string, now = new Date()) {
  const [row] = await db
    .update(announcement)
    .set({ endsAt: now, updatedAt: now })
    .where(and(eq(announcement.id, id), gt(announcement.endsAt, now)))
    .returning();
  forgetAnnouncements();
  return row ?? null;
}

/** Hides a banner until `until` (null unmutes). For an auto banner that isn't helping. */
export async function muteAnnouncement(id: string, until: Date | null, now = new Date()) {
  const [row] = await db
    .update(announcement)
    .set({ mutedUntil: until, updatedAt: now })
    .where(eq(announcement.id, id))
    .returning();
  forgetAnnouncements();
  return row ?? null;
}
