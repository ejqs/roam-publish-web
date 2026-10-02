import { describe, expect, test } from "bun:test";
import { safeNext, signedInRedirect } from "@/lib/safe-next";

/** Where a browser actually goes when it navigates to `next` from roam.pub. */
const lands = (next: string) => new URL(next, "https://roam.pub/login").origin;

describe("safeNext", () => {
  test("keeps same-site paths", () => {
    expect(safeNext("/dashboard/keys?x=1")).toBe("/dashboard/keys?x=1");
  });

  for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "evil", "", null, undefined])
    test(`falls back for ${JSON.stringify(bad)}`, () => {
      expect(safeNext(bad as string)).toBe("/dashboard");
    });

  // Browsers drop tabs and newlines from URLs, so "/\t/evil.example" becomes "//evil.example".
  for (const sneaky of ["/\t/evil.example", "/\n/evil.example", "/\r/evil.example", "/\t\\evil.example"])
    test.failing(`never leaves the site for ${JSON.stringify(sneaky)} (BUG: open redirect)`, () => {
      expect(lands(safeNext(sneaky))).toBe("https://roam.pub");
    });
});

describe("signedInRedirect", () => {
  test("never sends a signed-in person back to an auth form", () => {
    expect(signedInRedirect("/login?next=/x")).toBe("/dashboard");
    expect(signedInRedirect("/reset-password")).toBe("/dashboard");
    expect(signedInRedirect("/c/foo")).toBe("/c/foo");
  });
});
