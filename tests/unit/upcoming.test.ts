import { describe, expect, test } from "bun:test";
import { EXT_MIN_VERSION } from "@/lib/ext-compat";
import { extAtLeast } from "@/lib/ext-version";
import { UPCOMING } from "@/lib/upcoming";
import { SITE_VERSION } from "@/lib/version";
import { semver } from "@/lib/whats-new";

describe("upcoming changes", () => {
  test("each is a later major of roam.pub, waits on an extension version, and has its own anchor", () => {
    const [major] = semver(SITE_VERSION)!;
    for (const u of UPCOMING) {
      expect(semver(u.version)?.[0]).toBeGreaterThan(major);
      expect(u.version.endsWith(".0.0")).toBe(true);
      expect(semver(u.extension)).not.toBeNull();
      // Still to come: roam.pub doesn't need that extension yet.
      expect(extAtLeast(EXT_MIN_VERSION, u.extension)).toBe(false);
      expect(u.announced).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(u.id).toMatch(/^[a-z0-9-]+$/);
    }
    expect(new Set(UPCOMING.map((u) => u.id)).size).toBe(UPCOMING.length);
  });
});
