import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { timed } from "./telemetry";

/**
 * What's new (/updates): the website's CHANGELOG.md and the extension's, as one timeline. Both files
 * use the same shape: `## 2026-10-03` or `## 0.1.0 (2026-10-02)` or `## Unreleased`, then `### Area`,
 * then one bullet per change. Not to be confused with lib/changelog.ts, the change log written into Roam.
 */

export type Source = "web" | "ext";
export const SOURCE_LABEL: Record<Source, string> = { web: "Website", ext: "Extension" };

export type Entry = {
  id: string;
  source: Source;
  /** The UTC day it landed on main. */
  date: Date;
  /** The extension's version heading ("0.1.0", "Unreleased"); null for the website. */
  version: string | null;
  area: string;
  /** Markdown-lite: **bold**, `code` and [links](https://…). */
  text: string;
};

const EXT_REPO = "ejqs/roam-publish";
const extChangelogUrl = () =>
  process.env.EXTENSION_CHANGELOG_URL ?? `https://raw.githubusercontent.com/${EXT_REPO}/main/CHANGELOG.md`;
const extCommitsUrl = () =>
  process.env.EXTENSION_COMMITS_URL ?? `https://api.github.com/repos/${EXT_REPO}/commits?path=CHANGELOG.md&per_page=1`;

const DATE = /(\d{4}-\d{2}-\d{2})/;

/**
 * Turns a changelog into entries. `## Unreleased` entries get `unreleasedDate` (when the file last
 * changed), or are skipped without one. Lines outside a dated section or a bullet are ignored.
 */
export function parseChangelog(md: string, source: Source, unreleasedDate: Date | null = null): Entry[] {
  const out: Entry[] = [];
  let date: Date | null = null;
  let version: string | null = null;
  let area = "";
  let bullet: string[] | null = null;
  const flush = () => {
    if (bullet && date) {
      const text = bullet.join(" ").replace(/\s+/g, " ").trim();
      if (text) {
        const id = createHash("sha256").update(`${source}\n${date.toISOString().slice(0, 10)}\n${text}`).digest("hex").slice(0, 12);
        out.push({ id: `${source}-${id}`, source, date, version, area, text });
      }
    }
    bullet = null;
  };
  for (const line of md.split(/\r?\n/)) {
    const h2 = /^## (.+)$/.exec(line);
    if (h2) {
      flush();
      const head = h2[1].trim();
      area = "";
      if (/^unreleased$/i.test(head)) {
        date = unreleasedDate;
        version = "Unreleased";
      } else {
        const d = DATE.exec(head);
        date = d ? new Date(`${d[1]}T00:00:00Z`) : null;
        const v = /^v?(\d+\.\d+\.\d+\S*)/.exec(head);
        version = source === "ext" ? (v?.[1] ?? null) : null;
      }
      continue;
    }
    const h3 = /^### (.+)$/.exec(line);
    if (h3) {
      flush();
      area = h3[1].trim();
      continue;
    }
    if (/^- /.test(line)) {
      flush();
      bullet = [line.slice(2)];
    } else if (bullet && /^\s+\S/.test(line)) bullet.push(line.trim());
    else flush();
  }
  flush();
  return out;
}

/** An entry's text without markup, for the RSS feed. */
export const plainChange = (text: string) =>
  text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1");

/** Newest first; within a day, the website before the extension, then file order. */
export function mergeEntries(...lists: Entry[][]): Entry[] {
  const all = lists.flat().map((e, i) => ({ e, i }));
  all.sort((a, b) => b.e.date.getTime() - a.e.date.getTime() || (a.e.source === b.e.source ? a.i - b.i : a.e.source === "web" ? -1 : 1));
  return all.map((x) => x.e);
}

/** The extension's file is fetched at most this often; a failed fetch keeps serving the last copy. */
const EXT_TTL_MS = 60 * 60_000;
const FETCH_TIMEOUT_MS = 5_000;
let extCache: { at: number; entries: Entry[]; unreleased: Date | null } | null = null;
let webCache: Entry[] | null = null;

async function fetchText(url: string, accept: string) {
  const res = await timed(
    "github",
    () => fetch(url, { headers: { accept, "user-agent": "roam-publish-web" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" }),
    (r) => (r.ok ? undefined : `HTTP ${r.status}`),
  );
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

async function loadExt(now: number): Promise<Entry[]> {
  if (extCache && now - extCache.at < EXT_TTL_MS) return extCache.entries;
  try {
    const md = await fetchText(extChangelogUrl(), "text/plain");
    // When the file last changed dates its Unreleased section. Without it (and no earlier answer)
    // those entries wait for the next try.
    let unreleased = extCache?.unreleased ?? null;
    try {
      const commits = JSON.parse(await fetchText(extCommitsUrl(), "application/vnd.github+json")) as {
        commit?: { committer?: { date?: string } };
      }[];
      const d = commits[0]?.commit?.committer?.date;
      if (d) unreleased = new Date(`${d.slice(0, 10)}T00:00:00Z`);
    } catch {}
    extCache = { at: now, entries: parseChangelog(md, "ext", unreleased), unreleased };
  } catch (e) {
    console.error("What's new: couldn't fetch the extension's changelog", e);
    // Try again in a few minutes rather than on every request.
    extCache = { at: now - EXT_TTL_MS + 5 * 60_000, entries: extCache?.entries ?? [], unreleased: extCache?.unreleased ?? null };
  }
  return extCache.entries;
}

/** The website's file ships with the deploy, so it's read once per process. */
async function loadWeb(): Promise<Entry[]> {
  if (webCache) return webCache;
  try {
    webCache = parseChangelog(await readFile(path.join(process.cwd(), "CHANGELOG.md"), "utf8"), "web");
  } catch (e) {
    console.error("What's new: couldn't read CHANGELOG.md", e);
    return [];
  }
  return webCache;
}

/** Every entry from both changelogs, newest first. */
export async function whatsNew(now = Date.now()): Promise<Entry[]> {
  const [web, ext] = await Promise.all([loadWeb(), loadExt(now)]);
  return mergeEntries(web, ext);
}

/** Tests: start from nothing. */
export function forgetWhatsNew() {
  extCache = null;
  webCache = null;
}

export { SEEN_COOKIE } from "./whats-new-shared";

/**
 * What was there at the last visit: the newest day and how many entries it had. Entries only carry a
 * day, so the count catches one added later on the same day.
 */
export type Seen = { day: Date; count: number };

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

/** The cookie's value for these entries: `2026-10-03.12`. */
export function seenValue(entries: Entry[]): string | null {
  if (!entries.length) return null;
  const newest = entries.reduce((d, e) => (e.date > d ? e.date : d), entries[0].date);
  return `${dayKey(newest)}.${entries.filter((e) => e.date.getTime() === newest.getTime()).length}`;
}

/** The cookie read back, or null when there isn't one (a first visit) or it's malformed. */
export function parseSeen(value: string | undefined): Seen | null {
  const m = value ? /^(\d{4}-\d{2}-\d{2})\.(\d{1,4})$/.exec(value) : null;
  if (!m) return null;
  const day = new Date(`${m[1]}T00:00:00Z`);
  return Number.isNaN(day.getTime()) ? null : { day, count: Number(m[2]) };
}

/**
 * The entries new since that visit: every later day, and the whole of its day if that day has grown.
 * Empty on a first visit: there's nothing to catch up on.
 */
export function newSince(entries: Entry[], seen: Seen | null): Set<string> {
  if (!seen) return new Set();
  const sameDay = entries.filter((e) => e.date.getTime() === seen.day.getTime());
  const grew = sameDay.length > seen.count;
  return new Set(entries.filter((e) => e.date > seen.day || (grew && e.date.getTime() === seen.day.getTime())).map((e) => e.id));
}

/**
 * For the What's new links: whether to show the dot, and on a first visit the cookie value to plant,
 * so the dot can show from the next change on. Never throws: the dot isn't worth an error on the
 * page it sits on.
 */
export async function whatsNewDot(cookieValue: string | undefined): Promise<{ dot: boolean; plant: string | null }> {
  try {
    const entries = await whatsNew();
    const seen = parseSeen(cookieValue);
    return { dot: newSince(entries, seen).size > 0, plant: seen ? null : seenValue(entries) };
  } catch {
    return { dot: false, plant: null };
  }
}
