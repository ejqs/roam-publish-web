import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { backgroundJob } from "@/db/schema";

export type CheckState = "ok" | "fail" | "off";
export type Health = { ok: boolean; checks: { database: CheckState; jobs: CheckState } };

const DB_TIMEOUT_MS = 2000;
/** The job worker writes a heartbeat at least once a minute; three missed means it stopped. */
const JOBS_STALE_MS = 3 * 60_000;

function withTimeout<T>(p: Promise<T>, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => (timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms))),
  ]).finally(() => clearTimeout(timer));
}

/** Is the database answering, and is the background job worker alive? For /api/health and /admin/status. */
export async function checkHealth(now = new Date()): Promise<Health> {
  let database: CheckState = "ok";
  let jobs: CheckState = process.env.JOBS === "off" ? "off" : "ok";
  try {
    const [row] = await withTimeout(
      db.select({ last: sql<string | null>`max(${backgroundJob.lastFinishedAt})` }).from(backgroundJob),
      DB_TIMEOUT_MS,
    );
    if (jobs === "ok" && (!row?.last || now.getTime() - new Date(row.last).getTime() > JOBS_STALE_MS)) jobs = "fail";
  } catch {
    database = "fail";
    if (jobs === "ok") jobs = "fail";
  }
  return { ok: database !== "fail" && jobs !== "fail", checks: { database, jobs } };
}
