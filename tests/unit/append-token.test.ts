import { afterEach, describe, expect, test } from "bun:test";
import { decryptToken, encryptToken, openToken } from "@/lib/append-token";

const KEY = process.env.APPEND_TOKEN_KEY!;
afterEach(() => {
  process.env.APPEND_TOKEN_KEY = KEY;
  delete process.env.APPEND_TOKEN_KEY_PREVIOUS;
});

describe("append token encryption", () => {
  test("round-trips and never stores the plaintext", () => {
    const enc = encryptToken("roam-graph-token-secret");
    expect(enc).not.toContain("secret");
    expect(decryptToken(enc)).toBe("roam-graph-token-secret");
  });

  test("uses a fresh IV each time", () => {
    expect(encryptToken("t")).not.toBe(encryptToken("t"));
  });

  test("rejects tampering", () => {
    const [v, iv, tag, ct] = encryptToken("roam-graph-token-secret").split(".");
    const flipped = Buffer.from(ct, "base64url");
    flipped[0] ^= 1;
    expect(decryptToken([v, iv, tag, flipped.toString("base64url")].join("."))).toBeNull();
    expect(decryptToken("garbage")).toBeNull();
  });

  test("rotation: old key still decrypts while set as previous, and is flagged not current", () => {
    const enc = encryptToken("tok");
    process.env.APPEND_TOKEN_KEY_PREVIOUS = KEY;
    process.env.APPEND_TOKEN_KEY = Buffer.alloc(32, 9).toString("base64");
    expect(openToken(enc)).toEqual({ token: "tok", current: false });
    delete process.env.APPEND_TOKEN_KEY_PREVIOUS;
    expect(decryptToken(enc)).toBeNull();
  });

  test("refuses a key of the wrong length", () => {
    process.env.APPEND_TOKEN_KEY = Buffer.alloc(16).toString("base64");
    expect(() => encryptToken("t")).toThrow();
  });
});
