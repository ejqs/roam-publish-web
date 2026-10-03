/** The parts of lib/whats-new.ts the browser needs too. */

/** Remembers what someone saw on their last visit to /updates (`2026-10-03.12`: newest day, its entry count). */
export const SEEN_COOKIE = "whats_new_seen";

/** Writes the seen cookie from the browser: Server Components can't set cookies while rendering. */
export function writeSeenCookie(value: string) {
  document.cookie = `${SEEN_COOKIE}=${value}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
}
