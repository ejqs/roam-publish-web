import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { sendEmail } from "@/lib/email";
import { memberLabel } from "@/lib/invites";

describe("members lists", () => {
  const ann = { userId: "u-ann", email: "ann@example.com", name: "Ann" };

  test("the owner sees emails", () => {
    expect(memberLabel(ann, { id: "u-owner", isOwner: true })).toBe("ann@example.com");
  });

  test("other members see names, and their own email", () => {
    expect(memberLabel(ann, { id: "u-bob", isOwner: false })).toBe("Ann");
    expect(memberLabel(ann, { id: "u-ann", isOwner: false })).toBe("ann@example.com");
  });
});

describe("emails without RESEND_API_KEY", () => {
  const env = process.env as Record<string, string | undefined>;
  const { NODE_ENV, EMAIL_CONSOLE } = env;
  afterEach(() => Object.assign(env, { NODE_ENV, EMAIL_CONSOLE }));

  test("production never prints the body, whose links sign people in", async () => {
    env.NODE_ENV = "production";
    delete env.EMAIL_CONSOLE;
    const out = spyOn(console, "log");
    const err = spyOn(console, "error").mockImplementation(() => {});
    const sent = await sendEmail({ to: "ann@example.com", subject: "Reset", text: "https://roam.pub/reset?token=secret" });
    expect(sent).toBe(false);
    const printed = [...out.mock.calls, ...err.mock.calls].flat().join(" ");
    expect(printed).not.toContain("token=secret");
    expect(printed).not.toContain("ann@example.com");
    out.mockRestore();
    err.mockRestore();
  });
});
