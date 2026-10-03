import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { backgroundJob, user } from "@/db/schema";
import { REMIND_MS, runAlerts } from "@/lib/alerts";
import type { JobDef } from "@/lib/jobs";
import { drainBuckets, record } from "@/lib/telemetry";
import { flushMetrics } from "@/lib/telemetry-stats";
import { resetDb } from "../helpers/db";
import { makeUser } from "../helpers/factories";
import { request, resetRequest } from "../helpers/request";

spyOn(console, "error").mockImplementation(() => {});
const T = new Date("2026-01-01T10:00:00Z");
const at = (min: number) => new Date(T.getTime() + min * 60_000);
let cursor: Record<string, unknown>;

async function failures(minute: Date, n = 5) {
  for (let i = 0; i < n; i++) record("POST /api/ext/publications", "route", 30, "db timeout", minute);
  await flushMetrics(new Date(minute.getTime() + 60_000));
}

beforeEach(async () => {
  await resetDb();
  resetRequest();
  drainBuckets(new Date(8.64e15), true);
  cursor = {};
  delete process.env.ALERT_EMAILS;
  const admin = await makeUser({ email: "admin@example.com" });
  await db.update(user).set({ role: "admin" }).where(eq(user.id, admin.id));
  await makeUser({ email: "someone@example.com" });
  request.emails = []; // sign-up verification emails
});

describe("failure emails", () => {
  test("nothing wrong: no email", async () => {
    record("GET /ok", "route", 5, undefined, T);
    await flushMetrics(at(1));
    expect(await runAlerts(cursor, [], at(2))).toBeNull();
    expect(request.emails).toHaveLength(0);
  });

  test("emails the admins once when a problem starts, again when it's fixed", async () => {
    await failures(T);
    expect(await runAlerts(cursor, [], at(2))).toMatchObject({ problems: 1, started: 1, sent: 1 });
    expect(request.emails).toHaveLength(1);
    expect(request.emails[0]).toContain("to=admin@example.com");
    expect(request.emails[0]).toContain("New problems:");
    expect(request.emails[0]).toContain("POST /api/ext/publications: 5 of 5 calls failed (100%). Last: db timeout");

    // Same problem five minutes later: no second email.
    await failures(at(4));
    expect(await runAlerts(cursor, [], at(7))).toBeNull();
    expect(request.emails).toHaveLength(1);

    // Gone from the window: all clear.
    expect(await runAlerts(cursor, [], at(30))).toMatchObject({ problems: 0, fixed: 1 });
    expect(request.emails[1]).toContain("subject=[Roam Publish] All clear");
    expect(request.emails[1]).toContain("Fixed:");
  });

  test("reminds while a problem lasts", async () => {
    await failures(T);
    await runAlerts(cursor, [], at(2));
    const later = new Date(T.getTime() + REMIND_MS + 5 * 60_000);
    await failures(new Date(later.getTime() - 5 * 60_000));
    expect(await runAlerts(cursor, [], new Date(later.getTime() + 60_000))).toMatchObject({ problems: 1, started: 0 });
    expect(request.emails[1]).toContain("Still going:");
  });

  test("a couple of failures isn't a problem; a mostly-refused route is", async () => {
    await failures(T, 2);
    for (let i = 0; i < 25; i++) record("POST /api/ext/shortlinks", "route", 5, undefined, T, 409);
    await flushMetrics(at(1));
    expect(await runAlerts(cursor, [], at(2))).toMatchObject({ problems: 1 });
    expect(request.emails[0]).toContain("POST /api/ext/shortlinks: 100% of 25 calls refused (409 ×25)");
    expect(request.emails[0]).not.toContain("/api/ext/publications");
  });

  test("a failing background job is a problem", async () => {
    const job: JobDef = {
      name: "changelog-send",
      label: "Change log to Roam",
      description: "",
      schedule: "",
      intervalMs: 5_000,
      exclusive: false,
      disabledReason: () => null,
      run: async () => null,
    };
    await db.insert(backgroundJob).values({
      name: job.name,
      intervalMs: job.intervalMs,
      lastFinishedAt: at(1),
      consecutiveFailures: 4,
      lastError: "Roam said 500",
    });
    // Just started: jobs aren't checked yet.
    expect(await runAlerts(cursor, [job], at(2), { checkJobs: false })).toBeNull();
    expect(await runAlerts(cursor, [job], at(3), { checkJobs: true })).toMatchObject({ problems: 1 });
    expect(request.emails[0]).toContain('Job "Change log to Roam": failing (4 in a row). Last: Roam said 500');
    // A restart doesn't make an open job problem look fixed.
    expect(await runAlerts(cursor, [job], at(8), { checkJobs: false })).toBeNull();
    expect(request.emails).toHaveLength(1);
  });

  test("ALERT_EMAILS replaces the admin list", async () => {
    process.env.ALERT_EMAILS = "ops@example.com, oncall@example.com";
    await failures(T);
    await runAlerts(cursor, [], at(2));
    expect(request.emails.map((e) => e.match(/to=(\S+)/)?.[1])).toEqual(["ops@example.com", "oncall@example.com"]);
  });
});
