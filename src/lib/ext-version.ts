import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { extClient, graph, type JobResult } from "@/db/schema";
import { alertRecipients } from "./alerts";
import { json } from "./cors";
import { sendEmail } from "./email";
import { renderEmail } from "./email-layout";
import { liveExtVersion, semver } from "./whats-new";

/**
 * Which Roam Publish extension versions are still in use, so an older API is retired only once nobody
 * relies on it. The extension sends its version in this header from 0.2.0; older ones send nothing,
 * which is stored as null.
 *
 * To change an API without breaking older extensions: branch on `extAtLeast(ctx.extVersion, "x.y.z")`
 * in the route, ship the extension that uses the new shape, then remove the old branch once
 * `everyoneAtLeast("x.y.z")` (or /admin/extension, or the email from the extension-versions job) says
 * no active install is older. A request from an older one after that gets `updateNeeded`, which the
 * extension shows as it is, rather than a confusing failure.
 */
export { EXT_MIN_VERSION, EXT_VERSION_HEADER } from "./ext-compat";
import { EXT_VERSION_HEADER } from "./ext-compat";

/** How recently an install must have called to count as in use. */
export const ACTIVE_DAYS = 30;

/** The version the request says it's from, or null when it doesn't say or isn't a plain x.y.z. */
export function extVersionOf(req: Request): string | null {
  const v = req.headers.get(EXT_VERSION_HEADER)?.trim() ?? "";
  return semver(v) ? v : null;
}

/** -1, 0 or 1. Versions that don't parse sort first. */
export function compareVersions(a: string, b: string) {
  const x = semver(a) ?? [-1, -1, -1];
  const y = semver(b) ?? [-1, -1, -1];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
}

/** Whether a calling extension is `min` or newer; unknown (pre-0.2.0) versions are not. */
export const extAtLeast = (version: string | null, min: string) => version !== null && compareVersions(version, min) >= 0;

/**
 * Notes who called with which version. Writes at most once an hour per person and graph, unless the
 * version changed, so busy publishing doesn't mean a write per request.
 */
export async function recordExtClient(userId: string, graphId: string, version: string | null) {
  await db
    .insert(extClient)
    .values({ userId, graphId, version })
    .onConflictDoUpdate({
      target: [extClient.userId, extClient.graphId],
      set: { version, lastSeenAt: sql`now()` },
      setWhere: sql`${extClient.version} is distinct from ${version} or ${extClient.lastSeenAt} < now() - interval '1 hour'`,
    });
}

export type VersionUse = { version: string | null; people: number; graphs: number; installs: number; lastSeenAt: Date };

/** Installs seen in the last `days`, per version, newest version first and unknown last. */
export async function extVersionUse(days = ACTIVE_DAYS, now = new Date()): Promise<VersionUse[]> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      version: extClient.version,
      people: sql<number>`count(distinct ${extClient.userId})::int`,
      graphs: sql<number>`count(distinct ${extClient.graphId})::int`,
      installs: sql<number>`count(*)::int`,
      lastSeenAt: sql<Date>`max(${extClient.lastSeenAt})`,
    })
    .from(extClient)
    .where(gt(extClient.lastSeenAt, since))
    .groupBy(extClient.version);
  return rows
    .map((r) => ({ ...r, lastSeenAt: new Date(r.lastSeenAt) }))
    .sort((a, b) => (a.version === null ? 1 : b.version === null ? -1 : compareVersions(b.version, a.version)));
}

/** True when every install seen in the last `days` is `min` or newer, so code for older ones can go. */
export async function everyoneAtLeast(min: string, days = ACTIVE_DAYS, now = new Date()) {
  return (await extVersionUse(days, now)).every((r) => extAtLeast(r.version, min));
}

/** How many installs seen in the last `days` are `min` or newer, of how many (for /updates/upcoming). */
export async function readyFor(min: string, days = ACTIVE_DAYS, now = new Date()) {
  const use = await extVersionUse(days, now);
  return {
    ready: use.filter((r) => extAtLeast(r.version, min)).reduce((n, r) => n + r.installs, 0),
    total: use.reduce((n, r) => n + r.installs, 0),
  };
}

/** One person's installs seen in the last `days`: each graph they publish from, and the version there. */
export async function installsOf(userId: string, days = ACTIVE_DAYS, now = new Date()) {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return db
    .select({ graph: graph.name, version: extClient.version })
    .from(extClient)
    .innerJoin(graph, eq(graph.id, extClient.graphId))
    .where(and(eq(extClient.userId, userId), gt(extClient.lastSeenAt, since)))
    .orderBy(graph.name);
}

/**
 * The answer for an extension too old for this route: its own error message, which every version
 * shows to the person as it is.
 */
export function updateNeeded(req: Request, min: string) {
  return json(
    req,
    { error: `This needs Roam Publish ${min} or newer. Update it in Roam: Settings → Roam Depot → Installed extensions.` },
    426,
  );
}

/**
 * Emails the admins once per Roam Depot release when every install that called in the last
 * ACTIVE_DAYS is on it, so code kept for older versions can be removed. Run by the
 * extension-versions job; the version it last announced is kept in the job's cursor.
 */
export async function runExtVersionCheck(
  cursor: Record<string, unknown>,
  now = new Date(),
  liveVersion: (now: number) => Promise<string | null> = liveExtVersion,
): Promise<JobResult | null> {
  const live = await liveVersion(now.getTime());
  if (!live || cursor.announced === live) return null;
  const use = await extVersionUse(ACTIVE_DAYS, now);
  const people = use.reduce((n, r) => n + r.people, 0);
  if (!people || !use.every((r) => extAtLeast(r.version, live))) return { live, people, ready: 0 };

  const to = await alertRecipients();
  if (!to.length) return { live, people, ready: 1, sent: 0, reason: "no admins" };
  const site = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const { text, html } = renderEmail({
    audience: "admin",
    preview: `Every active install is on ${live}`,
    heading: `Everyone is on Roam Publish ${live}`,
    blocks: [
      {
        section: "What this means",
        tone: "info",
        items: [
          `All ${people} ${people === 1 ? "person" : "people"} who used the extension in the last ${ACTIVE_DAYS} days are on ${live} or newer.`,
          "Server code kept only for older versions can be removed. Anyone who comes back on an older version is asked to update.",
        ],
      },
    ],
    action: { label: "Open extension versions", url: `${site}/admin/extension` },
    note: "Sent once per extension release.",
  });
  let sent = 0;
  for (const address of to)
    if (await sendEmail({ to: address, subject: `[Roam Publish] Everyone is on extension ${live}`, text, html })) sent++;
  if (!sent) throw new Error(`Couldn't send the extension version email to ${to.join(", ")}`);
  cursor.announced = live;
  return { live, people, ready: 1, sent };
}
