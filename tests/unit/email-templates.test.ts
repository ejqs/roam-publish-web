import { describe, expect, test } from "bun:test";
import { hostedTemplate } from "@/lib/email";
import * as t from "@/lib/email-templates";
import { moderationEmail, moderationTemplate } from "@/lib/moderation-email-templates";

const sample: t.TemplateEmail[] = [
  t.email(t.verifyEmail, { address: "ann@example.com", url: "https://roam.pub/v?token=a&b=c" }),
  t.email(t.resetPassword, { address: "ann@example.com", url: "https://roam.pub/r" }),
  t.email(t.deleteAccount, { address: "ann@example.com", url: "https://roam.pub/d" }),
  t.email(t.invite, { type: "graph", typeLabel: "Graph", name: "notes", url: "https://roam.pub/i", days: "7" }),
  t.email(t.transferOffer, { type: "graph", typeLabel: "Graph", name: "notes", url: "https://roam.pub/i", days: "7" }),
  t.email(t.transferDoneOldOwner, { type: "graph", typeLabel: "Graph", name: "notes", newOwner: "bob@example.com" }),
  t.email(t.transferDoneNewOwner, { type: "graph", typeLabel: "Graph", name: "notes", url: "https://roam.pub/x" }),
  moderationTemplate({ kind: "page_removed", title: "Weekly", url: "https://roam.pub/p" }, "Spam", "mod@roam.pub"),
  moderationTemplate({ kind: "graph_restored", graphName: "notes", url: "https://roam.pub/g" }, "", undefined),
  moderationTemplate({ kind: "account_banned" }, "Abuse", undefined),
];

describe("Resend templates", () => {
  test("every placeholder is a declared variable, within Resend's limits", () => {
    const reserved = ["EMAIL", "FIRST_NAME", "LAST_NAME", "UNSUBSCRIBE_URL", "RESEND_UNSUBSCRIBE_URL"];
    for (const e of sample) {
      const h = hostedTemplate(e);
      const used = new Set([...`${h.subject}${h.html}${h.text}`.matchAll(/\{\{\{(\w+)\}\}\}/g)].map((m) => m[1]));
      expect([...used].sort()).toEqual(Object.keys(h.variables).filter((k) => used.has(k)).sort());
      for (const k of used) expect(h.keys).toContain(k);
      expect(h.keys.length).toBeLessThanOrEqual(20);
      for (const k of h.keys) expect(reserved).not.toContain(k);
    }
  });

  test("HTML gets escaped values, the subject and text raw ones", () => {
    const e = t.email(t.invite, { type: "graph", typeLabel: "Graph", name: `<b>"x" & y</b>`, url: "u", days: "7" });
    const h = hostedTemplate(e);
    expect(h.html).toContain("{{{NAME}}}");
    expect(h.html).not.toContain("{{{NAME_PLAIN}}}");
    expect(h.subject).toContain("{{{NAME_PLAIN}}}");
    expect(h.text).toContain("{{{NAME_PLAIN}}}");
    expect(h.variables.NAME).toBe("&lt;b&gt;&quot;x&quot; &amp; y&lt;/b&gt;");
    expect(h.variables.NAME_PLAIN).toBe(`<b>"x" & y</b>`);
  });

  test("the alias depends on the content, not the values", () => {
    const a = hostedTemplate(moderationTemplate({ kind: "account_banned" }, "One", undefined));
    const b = hostedTemplate(moderationTemplate({ kind: "account_banned" }, "Two", undefined));
    const none = hostedTemplate(moderationTemplate({ kind: "account_banned" }, " ", undefined));
    expect(a.alias).toBe(b.alias);
    expect(a.alias).toStartWith("rp-account-banned-");
    expect(none.alias).not.toBe(a.alias);
    expect(none.html).not.toContain("Reason");
  });

  test("filled in locally, values are escaped in HTML and kept in text", () => {
    const out = moderationEmail({ kind: "page_removed", title: "<script>", url: "https://roam.pub/p" }, "Spam", undefined);
    expect(out.subject).toBe(`Your page "<script>" was removed from roam.pub`);
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;");
    expect(out.text).toContain("Reason: Spam");
    expect(out.text).toContain("contact the roam.pub team");
  });
});
