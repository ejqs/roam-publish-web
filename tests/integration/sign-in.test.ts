import { beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { account, blockedIdentity, session, user, verification } from "@/db/schema";
import { auth } from "@/lib/auth";
import { hasPassword } from "@/lib/account-password";
import { blockedValue } from "@/lib/deletion";
import { loginOptions } from "@/server/actions/login";
import { changeAccountPassword, removeAccountPassword, setAccountPassword } from "@/server/actions/account";
import { resetDb } from "../helpers/db";
import { actAs, makeUser, signInByLink } from "../helpers/factories";
import { request, resetRequest } from "../helpers/request";

const origin = "http://localhost:3000";

let ip = 0;

/**
 * Calls a better-auth endpoint over HTTP, as the browser does. Each call comes from its own address:
 * with NODE_ENV=production (staging's pre-deploy) the links' rate limit, 5 a minute per address, is on.
 */
const call = (path: string, body?: unknown) =>
  auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", origin, "x-real-ip": `10.0.${ip >> 8 & 255}.${ip++ & 255}` },
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

describe("passwords are optional", () => {
  test("nobody signs up, resets or changes a password over HTTP", async () => {
    const u = await makeUser();
    for (const [path, body] of [
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

  test("without a password set, password log in fails", async () => {
    const u = await makeUser();
    const res = await call("/sign-in/email", { email: u.email, password: "correct horse battery" });
    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie().some((c) => c.includes("session_token="))).toBe(false);
  });

  test("a password added in Settings logs in, and the link still works", async () => {
    const u = await makeUser();
    actAs(u);
    expect(await setAccountPassword("short")).toMatchObject({ ok: false });
    expect(await setAccountPassword("correct horse battery")).toEqual({ ok: true });
    expect(await hasPassword(u.id)).toBe(true);
    expect(await setAccountPassword("another password 1")).toMatchObject({ ok: false });
    const res = await call("/sign-in/email", { email: u.email, password: "correct horse battery" });
    expect(res.status).toBe(200);
    expect(res.headers.getSetCookie().some((c) => c.includes("session_token="))).toBe(true);
    expect((await call("/sign-in/email", { email: u.email, password: "wrong password 1" })).status).toBe(401);
    expect(await signInByLink(u.email)).toContain("session_token=");
  });

  test("changing needs the current password and logs out other sessions", async () => {
    const u = await makeUser();
    actAs(u);
    await setAccountPassword("correct horse battery");
    const other = await signInByLink(u.email);
    expect(await changeAccountPassword("wrong password 1", "another password 1")).toMatchObject({ ok: false });
    expect(await changeAccountPassword("correct horse battery", "another password 1")).toEqual({ ok: true });
    expect((await call("/sign-in/email", { email: u.email, password: "correct horse battery" })).status).toBe(401);
    expect((await call("/sign-in/email", { email: u.email, password: "another password 1" })).status).toBe(200);
    const token = other.match(/session_token=([^.;]+)/)![1];
    expect(await db.query.session.findFirst({ where: eq(session.token, token) })).toBeUndefined();
  });

  test("removing it turns password log in off", async () => {
    const u = await makeUser();
    actAs(u);
    await setAccountPassword("correct horse battery");
    expect(await removeAccountPassword()).toEqual({ ok: true });
    expect(await hasPassword(u.id)).toBe(false);
    expect((await call("/sign-in/email", { email: u.email, password: "correct horse battery" })).status).toBe(401);
    expect(await setAccountPassword("another password 1")).toEqual({ ok: true });
  });

  test("log in asks for a password only when the account has one", async () => {
    const u = await makeUser();
    actAs(null);
    expect(await loginOptions(u.email)).toEqual({ ok: true, password: false });
    expect(await loginOptions("nobody@example.com")).toEqual({ ok: true, password: false });
    actAs(u);
    await setAccountPassword("correct horse battery");
    actAs(null);
    expect(await loginOptions(` ${u.email.toUpperCase()} `)).toEqual({ ok: true, password: true });
  });

  test("signed out, the Settings actions do nothing", async () => {
    actAs(null);
    expect(await setAccountPassword("correct horse battery")).toMatchObject({ ok: false });
    expect(await removeAccountPassword()).toMatchObject({ ok: false });
    expect(await db.select().from(account)).toHaveLength(0);
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
