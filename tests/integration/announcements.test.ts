import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { endAnnouncementAction, muteAnnouncementAction, postAnnouncementAction } from "@/server/actions/admin/announcements";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { db } from "@/db";
import { announcement, moderationAction, user } from "@/db/schema";
import { DISMISS_COOKIE, dismissId, forgetAnnouncements } from "@/lib/announcements";
import { BANNER_HOLD_MS, runStatusBanner } from "@/lib/status-banner";
import { drainBuckets, record } from "@/lib/telemetry";
import { flushMetrics } from "@/lib/telemetry-stats";
import { resetDb } from "../helpers/db";
import { actAs, makeUser, type TestUser } from "../helpers/factories";
import { textOf } from "../helpers/render";
import { request, resetRequest } from "../helpers/request";

spyOn(console, "error").mockImplementation(() => {});
const T = new Date("2026-01-01T10:00:00Z");
const at = (min: number) => new Date(T.getTime() + min * 60_000);
let cursor: Record<string, unknown>;

async function publishFailures(minute: Date, n = 6) {
  for (let i = 0; i < n; i++) record("POST /api/ext/publications", "route", 30, "db timeout", minute);
  await flushMetrics(new Date(minute.getTime() + 60_000));
}

const autoRows = () => db.select().from(announcement).where(eq(announcement.source, "auto"));

/** What the banner renders for the current request, as text ("" for none). */
async function bannerText() {
  forgetAnnouncements();
  return textOf(await AnnouncementBanner());
}

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries({ tone: "warning", audience: "everyone", duration: "7d", linkUrl: "", linkText: "", ...fields }))
    f.set(k, v);
  return f;
}

beforeEach(async () => {
  await resetDb();
  resetRequest();
  drainBuckets(new Date(8.64e15), true);
  forgetAnnouncements();
  cursor = {};
});

describe("automatic status banner", () => {
  test("goes up on the second run that sees a problem, keeps one row, and lapses after", async () => {
    await publishFailures(at(0));
    expect(await runStatusBanner(cursor, [], at(2))).toBeNull();
    expect(await autoRows()).toHaveLength(0);

    await publishFailures(at(2));
    expect(await runStatusBanner(cursor, [], at(3))).toMatchObject({ shown: 1, keys: "publishing:critical" });
    await publishFailures(at(3));
    await runStatusBanner(cursor, [], at(4));
    const rows = await autoRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "publishing", tone: "critical", audience: "signed-in", startsAt: at(3) });
    expect(rows[0].endsAt).toEqual(new Date(at(4).getTime() + BANNER_HOLD_MS));

    // Out of the window: the job leaves it alone and it ends on its own.
    expect(await runStatusBanner(cursor, [], at(30))).toBeNull();
    expect((await autoRows())[0].endsAt <= at(30)).toBe(true);

    // The next incident is a new start, so an old dismissal doesn't hide it.
    await publishFailures(at(40));
    await runStatusBanner(cursor, [], at(41));
    await runStatusBanner(cursor, [], at(42));
    expect((await autoRows())[0].startsAt).toEqual(at(42));
  });

  test("a single bad run doesn't put it up", async () => {
    await publishFailures(at(0));
    await runStatusBanner(cursor, [], at(2));
    expect(await runStatusBanner(cursor, [], at(30))).toBeNull();
    await publishFailures(at(30));
    expect(await runStatusBanner(cursor, [], at(32))).toBeNull();
    expect(await autoRows()).toHaveLength(0);
  });

  test("a publishing banner shows to signed-in people only; a page one to everyone", async () => {
    const now = new Date();
    for (let i = 0; i < 6; i++) record("POST /api/ext/publications", "route", 30, "boom", new Date(now.getTime() - 120_000));
    for (let i = 0; i < 4; i++) record("page /p/[id]", "page", 0, "render failed", new Date(now.getTime() - 120_000));
    await flushMetrics(now);
    await runStatusBanner(cursor, [], now);
    await runStatusBanner(cursor, [], now);

    actAs(null);
    expect(await bannerText()).toContain("Some published pages aren't loading right now.");
    actAs(await makeUser());
    // Critical publishing beats the reading warning.
    expect(await bannerText()).toContain("Publishing from Roam isn't working right now.");
  });

  test("a mute hides it and survives the job's next upsert", async () => {
    const now = new Date();
    for (let i = 0; i < 6; i++) record("dep resend", "dep", 30, "resend down", new Date(now.getTime() - 120_000));
    await flushMetrics(now);
    await runStatusBanner(cursor, [], now);
    await runStatusBanner(cursor, [], now);
    expect(await bannerText()).toContain("emails may be delayed");

    const [row] = await autoRows();
    await db.update(announcement).set({ mutedUntil: new Date(now.getTime() + 3_600_000) }).where(eq(announcement.id, row.id));
    await runStatusBanner(cursor, [], now);
    expect((await autoRows())[0].mutedUntil).not.toBeNull();
    expect(await bannerText()).toBe("");
  });

  test("a dismissed warning stays hidden for that visitor", async () => {
    const now = new Date();
    for (let i = 0; i < 6; i++) record("dep resend", "dep", 30, "resend down", new Date(now.getTime() - 120_000));
    await flushMetrics(now);
    await runStatusBanner(cursor, [], now);
    await runStatusBanner(cursor, [], now);
    const [row] = await autoRows();
    request.cookies.set(DISMISS_COOKIE, dismissId(row));
    expect(await bannerText()).toBe("");
  });
});

describe("admin announcements", () => {
  let admin: TestUser;
  beforeEach(async () => {
    admin = await makeUser();
    await db.update(user).set({ role: "admin" }).where(eq(user.id, admin.id));
  });

  test("only admins can post", async () => {
    actAs(await makeUser());
    await expect(postAnnouncementAction(null, form({ message: "hi" }))).rejects.toThrow("Not authorized");
  });

  test("posting shows it, replaces the last one, and is logged", async () => {
    actAs(admin);
    expect(await postAnnouncementAction(null, form({ message: "Maintenance Sunday", linkUrl: "/updates" }))).toMatchObject({ ok: true });
    expect(await postAnnouncementAction(null, form({ message: "Maintenance moved to Monday", tone: "critical" }))).toMatchObject({ ok: true });
    actAs(null);
    const text = await bannerText();
    expect(text).toContain("Maintenance moved to Monday");
    expect(text).not.toContain("Sunday");
    const live = (await db.select().from(announcement)).filter((a) => a.endsAt > new Date());
    expect(live).toHaveLength(1);
    const log = await db.select().from(moderationAction).where(eq(moderationAction.targetType, "announcement"));
    expect(log.map((l) => l.action)).toEqual(["announce", "announce"]);
  });

  test("refuses scripts as links and over-long messages", async () => {
    actAs(admin);
    expect(await postAnnouncementAction(null, form({ message: "x", linkUrl: "javascript:alert(1)" }))).toMatchObject({ ok: false });
    expect(await postAnnouncementAction(null, form({ message: "x", linkUrl: "//evil.example" }))).toMatchObject({ ok: false });
    expect(await postAnnouncementAction(null, form({ message: "x".repeat(141) }))).toMatchObject({ ok: false });
    expect(await db.select().from(announcement)).toHaveLength(0);
  });

  test("take down and mute", async () => {
    actAs(admin);
    await postAnnouncementAction(null, form({ message: "Heads up" }));
    const [row] = await db.select().from(announcement);
    expect(await muteAnnouncementAction(row.id, true)).toMatchObject({ ok: true });
    expect(await bannerText()).toBe("");
    expect(await muteAnnouncementAction(row.id, false)).toMatchObject({ ok: true });
    expect(await bannerText()).toContain("Heads up");
    expect(await endAnnouncementAction(row.id)).toMatchObject({ ok: true });
    expect(await bannerText()).toBe("");
    expect(await endAnnouncementAction(row.id)).toMatchObject({ ok: false });
  });
});
