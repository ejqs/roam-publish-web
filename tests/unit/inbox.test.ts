import { describe, expect, test } from "bun:test";
import { emailFrameDoc, parseAddress, quoteText, replyAddress, replySubject, textToHtml } from "@/lib/inbox";

describe("admin inbox helpers", () => {
  test("parseAddress splits a display name from the address", () => {
    expect(parseAddress("Ann Lee <Ann@Example.com>")).toEqual({ name: "Ann Lee", email: "ann@example.com" });
    expect(parseAddress('"Lee, Ann" <ann@example.com>')).toEqual({ name: "Lee, Ann", email: "ann@example.com" });
    expect(parseAddress("ann@example.com")).toEqual({ name: "", email: "ann@example.com" });
  });

  test("replySubject adds Re: once", () => {
    expect(replySubject("Your page was removed")).toBe("Re: Your page was removed");
    expect(replySubject("RE: hi")).toBe("RE: hi");
    expect(replySubject("")).toBe("Re: ");
  });

  test("replies go to Reply-To when the sender set one", () => {
    expect(replyAddress({ from: "a@x.com", reply_to: ["b@x.com"] })).toBe("b@x.com");
    expect(replyAddress({ from: "a@x.com", reply_to: null })).toBe("a@x.com");
    expect(replyAddress({ from: "a@x.com", reply_to: [] })).toBe("a@x.com");
  });

  test("quoteText quotes every line under who wrote it", () => {
    const q = quoteText("Hi\nPlease restore it.\n", "Ann <ann@x.com>", new Date("2026-10-06T08:00:00Z"));
    expect(q).toBe("On Tue, 06 Oct 2026 08:00:00 UTC, Ann <ann@x.com> wrote:\n> Hi\n> Please restore it.");
  });

  test("the email frame blocks remote loads before any of the email's markup", () => {
    const doc = emailFrameDoc(`<script>alert(1)</script><img src="https://track.example/p.gif">`);
    const csp = doc.indexOf("Content-Security-Policy");
    expect(csp).toBeGreaterThan(-1);
    expect(csp).toBeLessThan(doc.indexOf("<script>"));
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain("img-src data:");
  });

  test("a reply's HTML is the text, escaped", () => {
    expect(textToHtml(`<b>hi</b> & "you"`)).toContain("&lt;b&gt;hi&lt;/b&gt; &amp; &quot;you&quot;");
  });
});
