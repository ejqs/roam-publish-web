import { describe, expect, test } from "bun:test";
import { legalKey, legalMessage, legalNotice } from "@/lib/legal-notice";

const T1 = "2026-10-04T01:00:00.000Z";
const T2 = "2026-10-06T07:00:00.000Z";
const T3 = "2026-10-08T09:00:00.000Z";
const row = (times: { terms?: string; privacy?: string }, startsAt = new Date(T2)) => ({ key: legalKey(times), startsAt });

describe("legalNotice", () => {
  test("the first time ever, it only records the current version", () => {
    expect(legalNotice({ terms: T1, privacy: T2 }, [])).toEqual({ kind: "record" });
  });

  test("a deploy that changes neither page does nothing", () => {
    expect(legalNotice({ terms: T1, privacy: T2 }, [row({ terms: T1, privacy: T2 })])).toEqual({ kind: "none" });
  });

  test("announces just the page that changed", () => {
    expect(legalNotice({ terms: T1, privacy: T3 }, [row({ terms: T1, privacy: T2 })])).toEqual({
      kind: "announce",
      pages: ["privacy"],
    });
    expect(legalNotice({ terms: T3, privacy: T3 }, [row({ terms: T1, privacy: T2 })])).toEqual({
      kind: "announce",
      pages: ["terms", "privacy"],
    });
  });

  test("compares with the newest version announced, not an older one", () => {
    const rows = [row({ terms: T1, privacy: T1 }, new Date(T1)), row({ terms: T1, privacy: T2 }, new Date(T2))];
    expect(legalNotice({ terms: T1, privacy: T3 }, rows)).toEqual({ kind: "announce", pages: ["privacy"] });
  });

  test("rolling back to an older version announces nothing", () => {
    expect(legalNotice({ terms: T1, privacy: T1 }, [row({ terms: T1, privacy: T2 })])).toEqual({ kind: "record" });
  });

  test("a build that couldn't date the pages does nothing", () => {
    expect(legalNotice({}, [row({ terms: T1, privacy: T2 })])).toEqual({ kind: "none" });
  });

  test("ignores the status banner's own rows", () => {
    expect(legalNotice({ terms: T1 }, [{ key: "publishing", startsAt: new Date(T3) }])).toEqual({ kind: "record" });
  });
});

describe("legalMessage", () => {
  test("names what changed and links to it", () => {
    expect(legalMessage(["privacy"])).toEqual({ message: "We've updated our Privacy policy.", linkUrl: "/privacy", linkText: "Read it" });
    expect(legalMessage(["terms", "privacy"])).toEqual({
      message: "We've updated our Terms and Privacy policy.",
      linkUrl: "/terms",
      linkText: "Read the changes",
    });
  });
});
