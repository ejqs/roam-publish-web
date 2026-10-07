import { describe, expect, test } from "bun:test";
import {
  hideFromGraphBlocked,
  removeOwnPasswordBlocked,
  saveCollectionBlocked,
  saveContainerAccessBlocked as accessBlocked,
  setPlacePasswordBlocked,
  type ContainerAccessChange as ContainerAccess } from "@/lib/control-rules";

const value = (over: Partial<ContainerAccess> = {}): ContainerAccess => ({
  indexAccess: "open",
  defaultAccess: "open",
  password: "",
  clearPassword: false,
  ...over,
});

describe("saveContainerAccessBlocked", () => {
  test("open settings save", () => {
    expect(accessBlocked("graph", value(), false, 0)).toBeUndefined();
  });

  test("Password access needs a password, saved or typed", () => {
    expect(accessBlocked("graph", value({ defaultAccess: "password" }), false, 0)).toMatch(/Set a graph password/);
    expect(accessBlocked("collection", value({ indexAccess: "password" }), false, 0)).toMatch(/Set a collection password/);
    expect(accessBlocked("graph", value({ defaultAccess: "password" }), true, 0)).toBeUndefined();
    expect(accessBlocked("graph", value({ defaultAccess: "password", password: "hunter2" }), false, 0)).toBeUndefined();
  });

  test("removing the password while Password access uses it is refused", () => {
    expect(accessBlocked("graph", value({ defaultAccess: "password", clearPassword: true }), true, 0)).toMatch(/Set a graph password/);
  });

  test("a password that opens encrypted pages needs 10 characters and the current one", () => {
    expect(accessBlocked("graph", value({ password: "short" }), true, 2)).toMatch(/at least 10/);
    expect(accessBlocked("graph", value({ password: "long enough pw" }), true, 2)).toMatch(/current graph password/);
    expect(accessBlocked("graph", value({ password: "long enough pw", currentPassword: "old one" }), true, 2)).toBeUndefined();
    expect(accessBlocked("graph", value({ password: "long enough pw", resetEncrypted: true }), true, 2)).toBeUndefined();
  });

  test("without encrypted pages, a short new password is fine", () => {
    expect(accessBlocked("graph", value({ password: "short" }), true, 0)).toBeUndefined();
  });
});

describe("other control rules", () => {
  test("a page can't be hidden from its graph when it's in no collection", () => {
    expect(hideFromGraphBlocked(0)).toMatch(/collection first/);
    expect(hideFromGraphBlocked(1)).toBeUndefined();
  });

  test("an encrypted page's own password needs 10 characters", () => {
    expect(setPlacePasswordBlocked("", false)).toBeDefined();
    expect(setPlacePasswordBlocked("short", false)).toBeUndefined();
    expect(setPlacePasswordBlocked("short", true)).toMatch(/10 characters/);
    expect(setPlacePasswordBlocked("long enough pw", true)).toBeUndefined();
  });

  test("an own password is only removed with a password to fall back on", () => {
    expect(removeOwnPasswordBlocked({ label: "Notes", hasPassword: false })).toMatch(/Notes has no password/);
    expect(removeOwnPasswordBlocked({ label: "Notes", hasPassword: true })).toBeUndefined();
  });

  test("a collection needs a name", () => {
    expect(saveCollectionBlocked("  ", value(), false, 0)).toMatch(/name/);
  });
});
