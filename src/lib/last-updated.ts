import { execFileSync } from "node:child_process";

/**
 * When the legal pages last changed, from git history, so their "Last updated" line can't be
 * forgotten. next.config.ts works the times out once per build (`datePages`) and bakes them into
 * the bundle as LEGAL_UPDATED; the pages read them back with `lastUpdated`, so nothing is looked
 * up while serving. lib/legal-notice.ts announces a change from the same times.
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
/** Each page's last commit time (ISO), for the pages the build could date. */
export type LegalTimes = Partial<Record<LegalPage, string>>;

const ORDINAL = (d: number) =>
  d % 10 === 1 && d !== 11 ? "st" : d % 10 === 2 && d !== 12 ? "nd" : d % 10 === 3 && d !== 13 ? "rd" : "th";

/** A commit time → "October 3rd, 2026" (its UTC day). */
export function formatUpdated(iso: string) {
  const at = new Date(iso);
  const month = at.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const d = at.getUTCDate();
  return `${month} ${d}${ORDINAL(d)}, ${at.getUTCFullYear()}`;
}

function fromGit(file: string): string | null {
  try {
    const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    // A shallow clone's oldest commit looks like it touched every file, so its answer can't be trusted.
    if (git("rev-parse", "--is-shallow-repository") !== "false") return null;
    // The committer time: when it landed, after any rebase.
    const seconds = git("log", "-1", "--format=%ct", "--", file);
    return seconds ? new Date(Number(seconds) * 1000).toISOString() : null;
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
    return commit ? new Date(commit.commit.committer.date).toISOString() : null;
  } catch (err) {
    console.warn(`last-updated: couldn't date ${file} from GitHub:`, err);
    return null;
  }
}

/** Build time: each legal page's last commit time, as JSON for LEGAL_UPDATED. */
export async function datePages(): Promise<string> {
  const entries = await Promise.all(
    Object.entries(LEGAL_PAGES).map(async ([page, file]) => [page, fromGit(file) ?? (await fromGitHub(file))] as const),
  );
  return JSON.stringify(Object.fromEntries(entries.filter(([, at]) => at)));
}

/** What this build baked in. */
export function legalTimes(): LegalTimes {
  try {
    // Written out in full so Next inlines it from next.config's `env`.
    return JSON.parse(process.env.LEGAL_UPDATED || "{}") as LegalTimes;
  } catch {
    return {};
  }
}

/** "October 3rd, 2026", or null when the build couldn't date the page. */
export function lastUpdated(page: LegalPage): string | null {
  const at = legalTimes()[page];
  return at ? formatUpdated(at) : null;
}
