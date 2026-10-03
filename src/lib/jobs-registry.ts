import { eq } from "drizzle-orm";
import { db } from "@/db";
import { backgroundJob } from "@/db/schema";
import { flushChangeLog } from "./changelog";
import type { JobDef } from "./jobs";
import { runAlerts } from "./alerts";
import { flushMetrics } from "./telemetry-stats";
import { umamiDisabledReason } from "./umami";
import { countrySweep, fullSweep, hotSweep, withClient } from "./view-sync";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** Country lookups per run: one Umami call each. */
const countryBudget = () => {
  const n = Number(process.env.UMAMI_COUNTRY_CALLS);
  return Number.isInteger(n) && n > 0 ? n : 10;
};

export const FULL_SWEEP = "umami-full-sweep";

/** Every background job, in the order /admin/jobs lists them. */
export const JOBS: JobDef[] = [
  {
    name: "changelog-send",
    label: "Change log to Roam",
    description: "Appends queued change log entries under each page's status block in Roam.",
    schedule: "Every 5 seconds",
    intervalMs: 5_000,
    exclusive: false,
    disabledReason: () => (process.env.CHANGELOG_WORKER === "off" ? "CHANGELOG_WORKER=off" : null),
    run: async () => {
      const pages = await flushChangeLog();
      return pages ? { pages } : null;
    },
  },
  {
    name: "metrics-flush",
    label: "Request metrics",
    description: "Saves each minute's request counts and timings for /admin/status and drops those over two weeks old.",
    schedule: "Every minute",
    intervalMs: MINUTE,
    exclusive: false,
    disabledReason: () => null,
    run: () => flushMetrics(),
  },
  {
    name: "status-alerts",
    label: "Failure emails",
    description:
      "Emails the admins when routes, actions, outside services or jobs start failing, every 6 hours while it lasts, and when it's fixed.",
    schedule: "Every 5 minutes",
    intervalMs: 5 * MINUTE,
    exclusive: true,
    disabledReason: () => (process.env.ALERTS === "off" ? "ALERTS=off" : null),
    run: ({ cursor }) => runAlerts(cursor, JOBS),
  },
  {
    name: FULL_SWEEP,
    label: "Umami views: full sweep",
    description: "Reads every page's all-time views from Umami, so each count is at most a day old.",
    schedule: "Daily",
    intervalMs: 24 * HOUR,
    exclusive: true,
    disabledReason: umamiDisabledReason,
    run: ({ cursor }) => withClient(cursor, (client) => fullSweep(client, cursor)),
  },
  {
    name: "umami-hot-sweep",
    label: "Umami views: pages being read",
    description: "Adds views since the full sweep to pages read since then. Bigger counts update less often.",
    schedule: "Hourly",
    intervalMs: HOUR,
    exclusive: true,
    disabledReason: umamiDisabledReason,
    run: async ({ cursor }) => {
      const full = await db.query.backgroundJob.findFirst({ where: eq(backgroundJob.name, FULL_SWEEP) });
      const at = typeof full?.cursor.fullSweepAt === "string" ? new Date(full.cursor.fullSweepAt) : null;
      return withClient(cursor, (client) => hotSweep(client, at));
    },
  },
  {
    name: "umami-countries",
    label: "Umami views: reader countries",
    description: "Looks up where readers are, one page per call, within a budget. Listed pages go first.",
    schedule: "Every 5 minutes",
    intervalMs: 5 * MINUTE,
    exclusive: true,
    disabledReason: umamiDisabledReason,
    run: ({ cursor }) => withClient(cursor, (client) => countrySweep(client, countryBudget(), cursor)),
  },
];

export const jobByName = (name: string) => JOBS.find((j) => j.name === name);
