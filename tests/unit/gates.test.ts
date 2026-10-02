import { beforeEach, describe, expect, test } from "bun:test";
import { gate, hashPassword, isUnlocked, setUnlocked, verifyPassword } from "@/lib/gates";
import { request, resetRequest } from "../helpers/request";

beforeEach(() => resetRequest());

const anon = { member: false, manager: false, signedIn: false };
const lock = { scope: "graph" as const, id: "g1", version: 1 };

describe("passwords", () => {
  test("hash and verify", () => {
    const h = hashPassword("hunter22");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("hunter22", h)).toBe(true);
    expect(verifyPassword("hunter23", h)).toBe(false);
    expect(verifyPassword("x", null)).toBe(false);
    expect(verifyPassword("x", "plain$a$b")).toBe(false);
  });
});

describe("gate", () => {
  test("open is open; members needs sign-in then membership", async () => {
    expect(await gate("open", null, anon)).toBeNull();
    expect(await gate("members", null, anon)).toEqual({ need: "signin" });
    expect(await gate("members", null, { ...anon, signedIn: true })).toEqual({ need: "member" });
    expect(await gate("members", null, { ...anon, member: true })).toBeNull();
  });

  test("password needs the matching unlock cookie for the current version", async () => {
    expect(await gate("password", lock, anon)).toEqual({ need: "password", lock });
    await setUnlocked(lock);
    expect(await isUnlocked(lock)).toBe(true);
    expect(await gate("password", lock, anon)).toBeNull();
    // Changing the password (new version) signs everyone out.
    expect(await isUnlocked({ ...lock, version: 2 })).toBe(false);
    // The cookie for one lock doesn't open another.
    expect(await isUnlocked({ ...lock, id: "g2" })).toBe(false);
  });

  test("a forged unlock cookie doesn't work", async () => {
    request.cookies.set("rp_unlock_graph_g1", "forged");
    expect(await isUnlocked(lock)).toBe(false);
  });

  test("password access with no password anywhere stays locked", async () => {
    expect(await gate("password", null, anon)).toEqual({ need: "password", lock: null });
  });
});
