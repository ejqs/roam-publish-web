import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import Link from "next/link";
import AdminStatusPage from "@/app/admin/status/page";
import { db } from "@/db";
import { user } from "@/db/schema";
import { drainBuckets, record } from "@/lib/telemetry";
import { flushMetrics } from "@/lib/telemetry-stats";
import { resetDb } from "../helpers/db";
import { actAs, makeUser } from "../helpers/factories";
import { findElements, textOf } from "../helpers/render";
import { resetRequest } from "../helpers/request";

const props = (window?: string) =>
  ({ params: Promise.resolve({}), searchParams: Promise.resolve(window ? { window } : {}) }) as PageProps<"/admin/status">;

beforeEach(async () => {
  await resetDb();
  resetRequest();
  drainBuckets(new Date(8.64e15), true);
});

describe("/admin/status", () => {
  test("is a 404 for anyone but an admin", async () => {
    actAs(await makeUser());
    await expect(AdminStatusPage(props())).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_HTTP_ERROR_FALLBACK;404") });
  });

  test("shows recorded entry points to an admin", async () => {
    const admin = await makeUser();
    await db.update(user).set({ role: "admin" }).where(eq(user.id, admin.id));
    actAs(admin);
    const now = Date.now();
    record("GET /api/search", "route", 42, undefined, new Date(now - 5 * 60_000));
    await flushMetrics(new Date(now));
    // An unknown window falls back to the last 24 hours.
    const page = await AdminStatusPage(props("toString"));
    expect(textOf(page)).toContain("GET /api/search");
    const current = findElements(page, Link).filter((l) => l.props["aria-current"] === "page");
    expect(current.map((l) => l.props.href)).toEqual(["/admin/status"]);
  });
});
