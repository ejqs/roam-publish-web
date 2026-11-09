import type { Entry } from "./whats-new";

/** Releases per page of What's new: about 25 to 35 changes, a few screens on a phone. */
export const RELEASES_PER_PAGE = 10;

/**
 * Weeks the activity map covers, ending this week: back to the first change, but at least 12 and at most 26.
 * Narrow screens show the most recent weeks that fit.
 */
export function heatmapWeeks(entries: Entry[], now: Date): number {
  const oldest = entries.at(-1)?.stampedAt;
  const weeks = oldest ? Math.ceil((utcDay(now) - utcDay(oldest)) / (7 * DAY_MS)) + 1 : 0;
  return Math.min(Math.max(weeks, 12), 26);
}

export type Release = { at: Date; entries: Entry[] };

/** One group per release: the entries that went live together. `entries` must be newest first. */
export function byRelease(entries: Entry[]): Release[] {
  const groups: Release[] = [];
  for (const e of entries) {
    const last = groups.at(-1);
    if (last && last.at.getTime() === e.stampedAt.getTime()) last.entries.push(e);
    else groups.push({ at: e.stampedAt, entries: [e] });
  }
  return groups;
}

export const pageCount = (releases: number, per = RELEASES_PER_PAGE) => Math.max(1, Math.ceil(releases / per));

/** The `?page=` value read back: a whole number from 1 to `count`, else 1. */
export function parsePage(value: unknown, count: number): number {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : 1;
  return Math.min(Math.max(n, 1), count);
}

/** The page holding entry `id`, or null when it isn't among these releases. */
export function pageOf(releases: Release[], id: string, per = RELEASES_PER_PAGE): number | null {
  const i = releases.findIndex((r) => r.entries.some((e) => e.id === id));
  return i < 0 ? null : Math.floor(i / per) + 1;
}

export const pageSlice = (releases: Release[], page: number, per = RELEASES_PER_PAGE) => releases.slice((page - 1) * per, page * per);

export type HeatDay = {
  /** UTC midnight. */
  day: Date;
  count: number;
  /** 0 for none, then 1 to 4 by how many changes went live. */
  level: 0 | 1 | 2 | 3 | 4;
  /** Versions released that day, like "Website 0.28.3". */
  versions: string[];
  /** The day's newest entry, to link to. */
  first: string | null;
  future: boolean;
};

const DAY_MS = 86_400_000;
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export function heatLevel(count: number): HeatDay["level"] {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

/**
 * Changes per UTC day for the last `weeks` weeks, as columns of seven days (Monday first), oldest week first.
 * `label` names an entry's version, like "Website 0.28.3".
 */
export function heatmap(entries: Entry[], now: Date, label: (e: Entry) => string | null, weeks = heatmapWeeks(entries, now)): HeatDay[][] {
  const today = utcDay(now);
  const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY_MS;
  const start = monday - (weeks - 1) * 7 * DAY_MS;
  const byDay = new Map<number, Entry[]>();
  for (const e of entries) {
    const d = utcDay(e.stampedAt);
    if (d < start || d > today) continue;
    const list = byDay.get(d);
    if (list) list.push(e);
    else byDay.set(d, [e]);
  }
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => {
      const t = start + (w * 7 + i) * DAY_MS;
      const list = byDay.get(t) ?? [];
      const versions = [...new Set(list.map(label).filter((v): v is string => !!v))];
      return { day: new Date(t), count: list.length, level: heatLevel(list.length), versions, first: list[0]?.id ?? null, future: t > today };
    }),
  );
}
