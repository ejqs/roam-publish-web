import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { whatsNewStamp } from "@/db/schema";
import { timed } from "./telemetry";

/**
 * What's new (/updates): the website's CHANGELOG.md and the extension's, as one timeline. Both files
 * use the same shape: `## 0.1.0 (2026-10-02)` (or `## Unreleased` in the extension's), then `### Area`,
 * then one bullet per change, which starts with its kind (`New:`, `Improved:` or `Fixed:`). Not to be confused
 * with lib/changelog.ts, the change log written into Roam.
 *
 * Each entry is stamped (table whats_new_stamp) with when it went live: a website entry when the deploy carrying
 * it boots, an extension entry when Roam Depot starts serving the commit it's in. Extension changes Roam Depot
 * doesn't serve yet aren't shown at all.
 */

export type Source = "web" | "ext";
export const SOURCE_LABEL: Record<Source, string> = { web: "Website", ext: "Extension" };

export const KINDS = ["new", "improved", "fixed"] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABEL: Record<Kind, string> = { new: "New", improved: "Improved", fixed: "Fixed" };
const KIND_PREFIX = /^(New|Improved|Fixed):\s+/;

export type Entry = {
  id: string;
  source: Source;
  /** Its section's day (UTC midnight). */
  date: Date;
  /** When it went live; its section's day until a stamp says otherwise. */
  stampedAt: Date;
  /** Its release's version ("0.1.0", or "Unreleased" in the extension's file); null under a bare date. */
  version: string | null;
  /** From the bullet's `New:` / `Improved:` / `Fixed:`; null without one. */
  kind: Kind | null;
  area: string;
  /** Markdown-lite: **bold**, `code` and [links](https://…). */
  text: string;
};

const EXT_REPO = "ejqs/roam-publish";
const DEPOT_FILE = "extensions/ejqs/roam-publish.json";
/** The extension's Roam Depot entry; its `source_commit` is the version Roam Depot serves. */
const extDepotUrl = () =>
  process.env.EXTENSION_DEPOT_URL ?? `https://raw.githubusercontent.com/Roam-Research/roam-depot/main/${DEPOT_FILE}`;
/** The extension's changelog at a commit (`{sha}`). */
const extChangelogUrl = (sha: string) =>
  (process.env.EXTENSION_CHANGELOG_URL ?? `https://raw.githubusercontent.com/${EXT_REPO}/{sha}/CHANGELOG.md`).replace("{sha}", sha);
/** The last commit to that Roam Depot entry: when the version went live. */
const extCommitsUrl = () =>
  process.env.EXTENSION_COMMITS_URL ??
  `https://api.github.com/repos/Roam-Research/roam-depot/commits?path=${encodeURIComponent(DEPOT_FILE)}&per_page=1`;

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
      let text = bullet.join(" ").replace(/\s+/g, " ").trim();
      const k = KIND_PREFIX.exec(text);
      const kind = k ? (k[1].toLowerCase() as Kind) : null;
      if (k) text = text.slice(k[0].length);
      if (text) {
        // Not the date: a bullet moved to another section (Unreleased into a version) stays the same entry.
        const id = createHash("sha256").update(`${source}\n${text}`).digest("hex").slice(0, 12);
        out.push({ id: `${source}-${id}`, source, date, stampedAt: date, version, kind, area, text });
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
        version = v?.[1] ?? null;
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

/** Newest first; at the same time, the website before the extension, then file order. */
export function mergeEntries(...lists: Entry[][]): Entry[] {
  const all = lists.flat().map((e, i) => ({ e, i }));
  all.sort(
    (a, b) => b.e.stampedAt.getTime() - a.e.stampedAt.getTime() || (a.e.source === b.e.source ? a.i - b.i : a.e.source === "web" ? -1 : 1),
  );
  return all.map((x) => x.e);
}

/**
 * Stamps entries not stamped yet with `at(entry)`, and returns them all with their stamps. A stamp, once
 * written, never moves.
 */
async function stamp(entries: Entry[], source: Source, at: (e: Entry) => Date): Promise<Entry[]> {
  if (!entries.length) return entries;
  await db
    .insert(whatsNewStamp)
    .values(entries.map((e) => ({ id: e.id, source, firstSeenAt: at(e) })))
    .onConflictDoNothing();
  const rows = await db
    .select({ id: whatsNewStamp.id, at: whatsNewStamp.firstSeenAt })
    .from(whatsNewStamp)
    .where(inArray(whatsNewStamp.id, entries.map((e) => e.id)));
  const byId = new Map(rows.map((r) => [r.id, r.at]));
  return entries.map((e) => ({ ...e, stampedAt: byId.get(e.id) ?? e.stampedAt }));
}

/** The extension is checked at most this often; a failed check keeps serving the last copy. */
const EXT_TTL_MS = 60 * 60_000;
/** After a failure (GitHub or the database), try again this soon rather than on every request. */
const RETRY_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 5_000;
let extCache: { at: number; sha: string | null; entries: Entry[] } | null = null;
let webCache: { at: number; entries: Entry[]; stamped: boolean } | null = null;

async function fetchText(url: string, accept: string, allow404 = false) {
  const res = await timed(
    "github",
    () => fetch(url, { headers: { accept, "user-agent": "roam-publish-web" }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" }),
    (r) => (r.ok || (allow404 && r.status === 404) ? undefined : `HTTP ${r.status}`),
  );
  if (allow404 && res.status === 404) return null;
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

/** The commit Roam Depot serves the extension from, or null while it isn't in Roam Depot. */
async function liveExtCommit(): Promise<string | null> {
  const json = await fetchText(extDepotUrl(), "application/json", true);
  if (json === null) return null;
  const sha = (JSON.parse(json) as { source_commit?: unknown }).source_commit;
  if (typeof sha !== "string" || !/^[0-9a-f]{7,40}$/i.test(sha)) throw new Error("Roam Depot entry has no source_commit");
  return sha;
}

async function loadExt(now: number): Promise<Entry[]> {
  if (extCache && now - extCache.at < EXT_TTL_MS) return extCache.entries;
  try {
    const sha = await liveExtCommit();
    if (sha === null) {
      extCache = { at: now, sha, entries: [] };
      return extCache.entries;
    }
    let entries = extCache?.sha === sha ? extCache.entries : null;
    if (!entries) {
      const md = (await fetchText(extChangelogUrl(sha), "text/plain"))!;
      const released = parseChangelog(md, "ext").filter((e) => e.version !== "Unreleased");
      // New entries went live when Roam Depot's entry last changed; the time we noticed, if GitHub won't say.
      let live = new Date(now);
      try {
        const commits = JSON.parse((await fetchText(extCommitsUrl(), "application/vnd.github+json"))!) as {
          commit?: { committer?: { date?: string } };
        }[];
        const d = commits[0]?.commit?.committer?.date;
        if (d && !Number.isNaN(Date.parse(d))) live = new Date(d);
      } catch {}
      entries = await stamp(released, "ext", () => live);
    }
    extCache = { at: now, sha, entries };
  } catch (e) {
    console.error("What's new: couldn't load the extension's changelog", e);
    extCache = { at: now - EXT_TTL_MS + RETRY_MS, sha: extCache?.sha ?? null, entries: extCache?.entries ?? [] };
  }
  return extCache.entries;
}

/**
 * The website's file ships with the deploy, so it's read once per process, and the entries it adds are stamped
 * with the time this deploy first ran (src/instrumentation.ts calls this at boot). The first time ever, the
 * whole file is stamped with its section days instead, so the backlog doesn't all look new.
 */
export async function loadWeb(now = Date.now()): Promise<Entry[]> {
  if (webCache && (webCache.stamped || now - webCache.at < RETRY_MS)) return webCache.entries;
  let parsed: Entry[];
  try {
    parsed = webCache?.entries ?? parseChangelog(await readFile(path.join(process.cwd(), "CHANGELOG.md"), "utf8"), "web");
  } catch (e) {
    console.error("What's new: couldn't read CHANGELOG.md", e);
    return [];
  }
  try {
    const first = (await db.select({ id: whatsNewStamp.id }).from(whatsNewStamp).where(eq(whatsNewStamp.source, "web")).limit(1)).length === 0;
    const deployed = new Date(now);
    webCache = { at: now, entries: await stamp(parsed, "web", (e) => (first ? e.date : deployed)), stamped: true };
  } catch (e) {
    console.error("What's new: couldn't stamp the website's changes", e);
    webCache = { at: now, entries: parsed, stamped: false };
  }
  return webCache.entries;
}

/** Every entry from both changelogs, newest first. */
export async function whatsNew(now = Date.now()): Promise<Entry[]> {
  const [web, ext] = await Promise.all([loadWeb(now), loadExt(now)]);
  return mergeEntries(web, ext);
}

/** Tests: start from nothing. */
export function forgetWhatsNew() {
  extCache = null;
  webCache = null;
}

export { SEEN_COOKIE } from "./whats-new-shared";

/** The cookie's value for these entries: the newest stamp, in milliseconds. */
export function seenValue(entries: Entry[]): string | null {
  if (!entries.length) return null;
  return String(Math.max(...entries.map((e) => e.stampedAt.getTime())));
}

/**
 * The cookie read back: the newest stamp seen, or null when there isn't one (a first visit) or it's malformed.
 * The old `2026-10-03.12` (newest day, its entry count) reads as that day's start.
 */
export function parseSeen(value: string | undefined): Date | null {
  if (!value) return null;
  if (/^\d{1,15}$/.test(value)) return new Date(Number(value));
  const m = /^(\d{4}-\d{2}-\d{2})\.\d{1,4}$/.exec(value);
  if (!m) return null;
  const day = new Date(`${m[1]}T00:00:00Z`);
  return Number.isNaN(day.getTime()) ? null : day;
}

/** The entries that went live after that visit. Empty on a first visit: there's nothing to catch up on. */
export function newSince(entries: Entry[], seen: Date | null): Set<string> {
  if (!seen) return new Set();
  return new Set(entries.filter((e) => e.stampedAt > seen).map((e) => e.id));
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

/** A semantic version as numbers, or null if it isn't one. */
export function semver(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
