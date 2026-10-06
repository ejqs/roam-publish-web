import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { like } from "drizzle-orm";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { db } from "@/db";
import { announcement } from "@/db/schema";
import { forgetAnnouncements } from "@/lib/announcements";
import { announceLegalChanges } from "@/lib/legal-notice";
import { resetDb } from "../helpers/db";
import { actAs, makeUser } from "../helpers/factories";
import { textOf } from "../helpers/render";
import { resetRequest } from "../helpers/request";

const saved = process.env.LEGAL_UPDATED;
afterAll(() => void (process.env.LEGAL_UPDATED = saved));

const build = (times: { terms?: string; privacy?: string }) => void (process.env.LEGAL_UPDATED = JSON.stringify(times));
const legalRows = () => db.select().from(announcement).where(like(announcement.key, "legal:%"));
async function bannerText() {
  forgetAnnouncements();
  return textOf(await AnnouncementBanner());
}

const OCT4 = "2026-10-04T01:00:00.000Z";
const OCT6 = "2026-10-06T07:00:00.000Z";
const OCT8 = "2026-10-08T09:00:00.000Z";

beforeEach(async () => {
  await resetDb();
  resetRequest();
  actAs(await makeUser());
});

describe("announceLegalChanges", () => {
  test("the first deploy records the dates without a banner", async () => {
    build({ terms: OCT4, privacy: OCT6 });
    await announceLegalChanges();
    const rows = await legalRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].endsAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(await bannerText()).toBe("");
  });

  test("a deploy that changes the privacy policy puts up an info banner for signed-in people", async () => {
    build({ terms: OCT4, privacy: OCT6 });
    await announceLegalChanges(new Date(Date.now() - 60_000));
    build({ terms: OCT4, privacy: OCT8 });
    await announceLegalChanges();
    expect(await bannerText()).toContain("We've updated our Privacy policy.");
    const live = (await legalRows()).filter((r) => r.endsAt > new Date());
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ tone: "info", audience: "signed-in", linkUrl: "/privacy" });

    actAs(null);
    expect(await bannerText()).toBe("");
  });

  test("booting the same deploy again, or on a second replica, changes nothing", async () => {
    build({ terms: OCT4, privacy: OCT6 });
    await announceLegalChanges(new Date(Date.now() - 60_000));
    build({ terms: OCT8, privacy: OCT6 });
    await announceLegalChanges();
    await Promise.all([announceLegalChanges(), announceLegalChanges()]);
    expect(await legalRows()).toHaveLength(2);
    expect(await bannerText()).toContain("We've updated our Terms.");
  });
});
