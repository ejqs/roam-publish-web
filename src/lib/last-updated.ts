import { execFileSync } from "node:child_process";

/**
 * When the legal pages last changed, from git history, so their "Last updated" line can't be
 * forgotten. next.config.ts works the dates out once per build (`datePages`) and bakes them into
 * the bundle as LEGAL_UPDATED; the pages read them back with `lastUpdated`, so nothing is looked
 * up while serving.
 *
 * Railway builds from a snapshot without `.git`, and CI checks out one commit, so when local
 * history can't answer (no repo, or a shallow one) this asks GitHub for the last commit touching
 * the file as of the commit being deployed (`RAILWAY_GIT_COMMIT_SHA`). If neither works the date
 * is left out rather than guessed.
 */
const REPO = "ejqs/roam-publish-web";

export const LEGAL_PAGES = {
  terms: "src/app/terms/page.tsx",
  privacy: "src/app/privacy/page.tsx",
} as const;
export type LegalPage = keyof typeof LEGAL_PAGES;

const ORDINAL = (d: number) =>
  d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";

/** "2026-10-03" → "October 3rd, 2026". */
export function formatUpdated(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const month = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  return `${month} ${d}${ORDINAL(d)}, ${y}`;
}

function fromGit(file: string): string | null {
  try {
    const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    // A shallow clone's oldest commit looks like it touched every file, so its answer can't be trusted.
    if (git("rev-parse", "--is-shallow-repository") !== "false") return null;
    // The committer date (when it landed, after any rebase), as a UTC day like GitHub's below.
    const seconds = git("log", "-1", "--format=%ct", "--", file);
    return seconds ? new Date(Number(seconds) * 1000).toISOString().slice(0, 10) : null;
  } catch {
    return null;
  }
}

async function fromGitHub(file: string): Promise<string | null> {
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA;
  const url = `https://api.github.com/repos/${REPO}/commits?path=${encodeURIComponent(file)}&per_page=1${sha ? `&sha=${sha}` : ""}`;
  const token = process.env.GITHUB_TOKEN;
  try {
    const res = await fetch(url, {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "roam-publish-web",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const [commit] = (await res.json()) as { commit: { committer: { date: string } } }[];
    return commit?.commit.committer.date.slice(0, 10) ?? null;
  } catch (err) {
    console.warn(`last-updated: couldn't date ${file} from GitHub:`, err);
    return null;
  }
}

async function dateFile(file: string): Promise<string | null> {
  const day = fromGit(file) ?? (await fromGitHub(file));
  return day ? formatUpdated(day) : null;
}

/** Build time: each legal page's "Last updated" date, as JSON for LEGAL_UPDATED. */
export async function datePages(): Promise<string> {
  const entries = await Promise.all(
    Object.entries(LEGAL_PAGES).map(async ([page, file]) => [page, await dateFile(file)] as const),
  );
  return JSON.stringify(Object.fromEntries(entries.filter(([, day]) => day)));
}

/** "October 3rd, 2026", or null when the build couldn't date the page. */
export function lastUpdated(page: LegalPage): string | null {
  // Written out in full so Next inlines it from next.config's `env`.
  const dates = JSON.parse(process.env.LEGAL_UPDATED || "{}") as Partial<Record<LegalPage, string>>;
  return dates[page] ?? null;
}
