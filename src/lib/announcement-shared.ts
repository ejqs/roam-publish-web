/** The parts of lib/announcements.ts the browser needs too: no database here. */

/** Holds the dismissed banner's id, so the server leaves it out and nothing flashes. */
export const DISMISS_COOKIE = "ann_dismissed";

/** Manual announcements: about two lines on a phone. */
export const MESSAGE_MAX = 140;

type Ref = { id: string; source: "manual" | "auto"; key: string | null; startsAt: Date };

/**
 * What a dismissal remembers. An auto banner keeps its row across incidents, so its start is part of
 * it: the next incident shows again.
 */
export const dismissId = (a: Ref) => (a.source === "auto" ? `${a.key}.${a.startsAt.getTime()}` : a.id);

/** Only critical banners can't be dismissed: they stay until they end. */
export const dismissible = (a: { tone: "info" | "warning" | "critical" }) => a.tone !== "critical";
