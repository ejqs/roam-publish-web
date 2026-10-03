import { describe, expect, test } from "bun:test";
import fixtures from "../fixtures/content-hash.json";
import { contentHash } from "@/lib/content-hash";
import { stableStringify } from "@/lib/stable-stringify";

/**
 * The extension hashes the same way and must get the same answers byte for byte. The fixtures are
 * copied verbatim into roam-publish/tests/fixtures/content-hash.json; change both or neither.
 */
describe("content hash parity with the extension", () => {
  for (const f of fixtures)
    test(f.name, () => {
      expect(contentHash(f as never)).toBe(f.hash);
    });

  test("stable stringify: sorted keys, undefined dropped, no whitespace", () => {
    expect(stableStringify({ b: 1, a: [{ d: undefined, c: "x" }] })).toBe('{"a":[{"c":"x"}],"b":1}');
  });
});
