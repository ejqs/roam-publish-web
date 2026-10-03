import { cookies } from "next/headers";
import { type Announcement, DISMISS_COOKIE, liveAnnouncements, pickAnnouncement } from "@/lib/announcements";
import { viewerId } from "@/lib/viewer";
import { BannerView } from "./banner-view";

/**
 * The site-wide banner above everything, for urgent announcements only. Rendered on the server so
 * it's there on first paint; a dismissed warning is left out by its cookie.
 */
export async function AnnouncementBanner() {
  let rows: Announcement[];
  try {
    rows = await liveAnnouncements();
  } catch {
    // The banner must never take a page down with it.
    return null;
  }
  if (!rows.length) return null;
  const [signedIn, jar] = await Promise.all([viewerId().then(Boolean), cookies()]);
  const a = pickAnnouncement(rows, { signedIn, dismissed: jar.get(DISMISS_COOKIE)?.value });
  return a ? <BannerView announcement={a} /> : null;
}
