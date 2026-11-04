import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { account, blockedIdentity, session, user, verification } from "@/db/schema";
import { auth } from "@/lib/auth";
import { blockedValue } from "@/lib/deletion";
import { resetDb } from "../helpers/db";
import { makeUser, signInByLink } from "../helpers/factories";
import { request, resetRequest } from "../helpers/request";

const origin = "http://localhost:3000";

/** Calls a better-auth endpoint over HTTP, as the browser does. */
const call = (path: string, body?: unknown) =>
  auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", origin },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    }),
  );

/** Asks for a link the way the log in form does, and returns the link from the email. */
async function requestLink(email: string, extra: Record<string, string> = {}) {
  const res = await call("/sign-in/magic-link", {
    email,
    callbackURL: "/dashboard",
    newUserCallbackURL: "/onboarding",
    errorCallbackURL: "/login?next=%2Fdashboard",
    ...extra,
  });
  expect(res.status).toBe(200);
  const sent = request.emails.findLast((e) => e.includes(`to=${email} `))!;
  expect(sent).toContain("subject=Log in to Roam Publish");
  return new URL(sent.match(/https?:\/\/\S+\/magic-link\/verify\S+/)![0]);
}

const open = (link: URL) => call(`${link.pathname.replace("/api/auth", "")}${link.search}`);

beforeEach(async () => {
  await resetDb();
  resetRequest();
});

describe("password sign-in is gone", () => {
  test("the email and password endpoints don't exist", async () => {
    const u = await makeUser();
    for (const [path, body] of [
      ["/sign-in/email", { email: u.email, password: "correct horse battery" }],
      ["/sign-up/email", { email: "new@example.com", password: "correct horse battery", name: "New" }],
      ["/request-password-reset", { email: u.email, redirectTo: "/reset-password" }],
      ["/reset-password", { token: "x", newPassword: "another password 1" }],
      ["/change-password", { currentPassword: "correct horse battery", newPassword: "another password 1" }],
    ] as const) {
      const res = await call(path, body);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.headers.getSetCookie()).toHaveLength(0);
    }
    expect(await db.select().from(user)).toHaveLength(1);
    expect(request.emails).toHaveLength(0);
  });
});

describe("sign-in links", () => {
  test("a new email gets an account, verified, and goes to onboarding", async () => {
    const link = await requestLink("new@example.com", { name: "Ann" });
    const res = await open(link);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${origin}/onboarding`);
    expect(res.headers.getSetCookie().some((c) => c.includes("session_token"))).toBe(true);
    const row = await db.query.user.findFirst({ where: eq(user.email, "new@example.com") });
    expect(row).toMatchObject({ name: "Ann", emailVerified: true });
    expect(await db.select().from(account)).toHaveLength(0);
  });

  test("someone who signed up with a password logs in to the same account", async () => {
    const [u] = await db
      .insert(user)
      .values({ id: "old-user", name: "Old", email: "old@example.com", emailVerified: true })
      .returning();
    await db.insert(account).values({
      id: "old-account",
      accountId: u.id,
      providerId: "credential",
      userId: u.id,
      password: "salt:hash",
      updatedAt: new Date(),
    });
    const res = await open(await requestLink(u.email));
    expect(res.headers.get("location")).toBe(`${origin}/dashboard`);
    const sessions = await db.select().from(session);
    expect(sessions.map((s) => s.userId)).toEqual([u.id]);
    expect(await db.select().from(user)).toHaveLength(1);
  });

  test("someone who signed up but never verified is verified by opening the link", async () => {
    const u = await makeUser({ verified: false });
    await signInByLink(u.email);
    const row = await db.query.user.findFirst({ where: eq(user.id, u.id) });
    expect(row?.emailVerified).toBe(true);
  });

  test("a link works once", async () => {
    const link = await requestLink("once@example.com");
    expect((await open(link)).headers.get("location")).toBe(`${origin}/onboarding`);
    const again = await open(link);
    const to = new URL(again.headers.get("location")!);
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("error")).toBe("INVALID_TOKEN");
    expect(again.headers.getSetCookie().some((c) => c.includes("session_token="))).toBe(false);
  });

  test("an expired link doesn't log in", async () => {
    const link = await requestLink("late@example.com");
    await db.update(verification).set({ expiresAt: new Date(Date.now() - 1000) });
    const res = await open(link);
    expect(new URL(res.headers.get("location")!).searchParams.get("error")).toBe("INVALID_TOKEN");
    expect(await db.select().from(user)).toHaveLength(0);
  });

  test("only a hash of the link's token is stored", async () => {
    const link = await requestLink("hash@example.com");
    const token = link.searchParams.get("token")!;
    const rows = await db.select().from(verification);
    expect(rows).toHaveLength(1);
    expect(rows[0].identifier).not.toContain(token);
  });

  test("a blocked email can't make an account", async () => {
    await db.insert(blockedIdentity).values({ kind: "email", value: blockedValue("email", "gone@example.com") });
    const res = await open(await requestLink("gone@example.com"));
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("error_description")).toContain("can't be used on Roam Publish");
    expect(await db.select().from(user)).toHaveLength(0);
  });

  test("a suspended account is sent back to log in with the reason", async () => {
    const u = await makeUser();
    await db.delete(session);
    await db.update(user).set({ banned: true }).where(eq(user.id, u.id));
    const res = await open(await requestLink(u.email));
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("error")).toBe("BANNED_USER");
    expect(await db.select().from(session)).toHaveLength(0);
  });
});
