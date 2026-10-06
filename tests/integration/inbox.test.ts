import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { replyToInboxEmail } from "@/app/admin/inbox/actions";
import { db } from "@/db";
import { inboxReply, user } from "@/db/schema";
import { type InboxEmail, inboxClient } from "@/lib/inbox";
import { resetDb } from "../helpers/db";
import { actAs, makeUser, type TestUser } from "../helpers/factories";
import { request, resetRequest } from "../helpers/request";

spyOn(console, "error").mockImplementation(() => {});

const EMAIL: InboxEmail = {
  object: "email",
  id: "em_1",
  to: ["moderation@roam.pub"],
  from: "Ann <ann@example.com>",
  created_at: "2026-10-06T08:00:00Z",
  subject: "Your page was removed",
  bcc: null,
  cc: null,
  reply_to: ["ann.replies@example.com"],
  received_for: ["moderation@roam.pub"],
  html: null,
  text: "Please restore it.",
  headers: null,
  message_id: "<abc@example.com>",
  attachments: [],
};

const realGet = inboxClient.get;
let admin: TestUser;

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeEach(async () => {
  await resetDb();
  resetRequest();
  admin = await makeUser();
  await db.update(user).set({ role: "admin" }).where(eq(user.id, admin.id));
  request.emails = []; // sign-up verification
  inboxClient.get = async (id) => (id === EMAIL.id ? { ok: true, data: EMAIL } : { ok: false, error: "Not found" });
});
afterEach(() => {
  inboxClient.get = realGet;
});

describe("admin inbox replies", () => {
  test("go to the email's Reply-To, threaded, quoting it, and are logged", async () => {
    actAs(admin);
    const res = await replyToInboxEmail(null, form({ emailId: "em_1", body: "Restored, sorry.", to: "evil@x.com" }));
    expect(res).toEqual({ ok: true, message: "Reply sent to ann.replies@example.com." });

    expect(request.emails).toHaveLength(1);
    const sent = request.emails[0];
    expect(sent).toContain("to=ann.replies@example.com");
    expect(sent).not.toContain("evil@x.com");
    expect(sent).toContain("subject=Re: Your page was removed");
    expect(sent).toContain("Restored, sorry.");
    expect(sent).toContain("> Please restore it.");

    const rows = await db.select().from(inboxReply);
    expect(rows).toMatchObject([{ emailId: "em_1", adminId: admin.id, to: "ann.replies@example.com", body: "Restored, sorry." }]);
  });

  test("are refused for anyone who isn't an admin", async () => {
    actAs(await makeUser());
    request.emails = [];
    await expect(replyToInboxEmail(null, form({ emailId: "em_1", body: "hi" }))).rejects.toThrow("Not authorized");
    actAs(null);
    await expect(replyToInboxEmail(null, form({ emailId: "em_1", body: "hi" }))).rejects.toThrow("Not authorized");
    expect(request.emails).toHaveLength(0);
    expect(await db.select().from(inboxReply)).toHaveLength(0);
  });

  test("need a body and an email that exists", async () => {
    actAs(admin);
    expect(await replyToInboxEmail(null, form({ emailId: "em_1", body: "   " }))).toEqual({
      ok: false,
      message: "Write a reply first.",
    });
    expect((await replyToInboxEmail(null, form({ emailId: "nope", body: "hi" })))?.ok).toBe(false);
    expect(request.emails).toHaveLength(0);
  });
});
