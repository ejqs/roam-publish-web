import { beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { submitReport } from "@/app/report/actions";
import { db } from "@/db";
import { report } from "@/db/schema";
import { deleteAccountData, reporterEmailHash } from "@/lib/deletion";
import { reportReasons } from "@/lib/report-reasons";
import { resetDb } from "../helpers/db";
import { actAs, makeGraph, makeUser } from "../helpers/factories";
import { resetRequest } from "../helpers/request";

let ipN = 0;

beforeEach(async () => {
  await resetDb();
  // A fresh address each test, so the in-memory report rate limit never carries over.
  resetRequest({ ip: `198.51.100.${++ipN}` });
});

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const fileReport = (graphName: string, email = "") =>
  submitReport(null, form({ graphName, reason: reportReasons[0], details: "x", email }));

describe("report IP hash", () => {
  test("is keyed, not a plain hash of the IP, and still drops a repeat report", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    actAs(null);
    expect((await fileReport(g.name))?.ok).toBe(true);
    expect((await fileReport(g.name))?.ok).toBe(true);
    const rows = await db.select().from(report);
    expect(rows).toHaveLength(1);
    const ip = `198.51.100.${ipN}`;
    expect(rows[0].ipHash).not.toContain(ip);
    expect(rows[0].ipHash).not.toBe(createHash("sha256").update(`report:${ip}`).digest("hex"));
  });
});

describe("deleting an account", () => {
  test("hashes the email on reports it filed, signed in or with the same address, and leaves others alone", async () => {
    const owner = await makeUser();
    const g = await makeGraph(owner.id);
    const reporter = await makeUser();
    actAs(reporter);
    await fileReport(g.name);
    actAs(null);
    resetRequest({ ip: `198.51.100.${++ipN}` });
    await fileReport(g.name, reporter.email.toUpperCase());
    resetRequest({ ip: `198.51.100.${++ipN}` });
    await fileReport(g.name, "someone-else@example.com");

    await deleteAccountData(reporter);

    const emails = (await db.select({ e: report.reporterEmail }).from(report)).map((r) => r.e).sort();
    const hashed = reporterEmailHash(reporter.email);
    expect(hashed).not.toContain("@");
    expect(emails).toEqual([hashed, hashed, "someone-else@example.com"].sort());
  });
});
