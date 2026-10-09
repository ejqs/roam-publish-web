import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import type { Node } from "@/db/app-schema";
import { encryptTitle, encryptTree, newLockKey, passwordKeyFor, proofHashOf, proofMatches, sealContentKey } from "@/lib/encryption";
import { b64, openPage, openTitle, passwordKey, saltOf, unb64, unlockProof, unwrapPrivateKey } from "@/lib/reader-crypto";

// The browser has to read exactly what the server wrote, byte for byte.
const PW = "correct horse battery";
const tree: Node = { uid: "root", string: "", children: [{ uid: "a", string: "the launch code is zanzibar", children: [] }] };

function sealedPage() {
  const lock = newLockKey(PW);
  const ck = randomBytes(32);
  return {
    lock,
    page: {
      id: "pub-1",
      cipher: encryptTree(ck, tree, "pub-1"),
      titleCipher: encryptTitle(ck, "Zanzibar plans", "pub-1"),
      sealedKey: sealContentKey(lock.publicKey, ck),
    },
  };
}

describe("the reader's browser opens what the server sealed", () => {
  test("derives the same password key as the server", async () => {
    const { lock } = sealedPage();
    const server = passwordKeyFor(lock.wrappedPrivateKey, PW)!;
    const browser = await passwordKey(PW, saltOf(lock.wrappedPrivateKey));
    expect(Buffer.from(browser).equals(server)).toBe(true);
  });

  test("its unlock proof matches the hash the server keeps, and a wrong password's doesn't", async () => {
    const { lock } = sealedPage();
    const salt = saltOf(lock.wrappedPrivateKey);
    expect(proofMatches(await unlockProof(await passwordKey(PW, salt)), lock.proofHash)).toBe(true);
    expect(proofMatches(await unlockProof(await passwordKey("wrong password", salt)), lock.proofHash)).toBe(false);
    expect(proofHashOf(passwordKeyFor(lock.wrappedPrivateKey, PW)!)).toBe(lock.proofHash);
  });

  test("opens the page's tree with the unwrapped private key", async () => {
    const { lock, page } = sealedPage();
    const key = await unwrapPrivateKey(lock.wrappedPrivateKey, await passwordKey(PW, saltOf(lock.wrappedPrivateKey)));
    expect(key).not.toBeNull();
    // Kept non-extractable: page scripts can open pages with it but not read it out.
    expect(key!.extractable).toBe(false);
    expect((await openPage(page, key!))?.tree).toEqual(tree);
  });

  test("refuses the wrong password, another password's key, and tampered or moved content", async () => {
    const { lock, page } = sealedPage();
    expect(await unwrapPrivateKey(lock.wrappedPrivateKey, await passwordKey("wrong password", saltOf(lock.wrappedPrivateKey)))).toBeNull();

    const other = sealedPage();
    const otherKey = await unwrapPrivateKey(other.lock.wrappedPrivateKey, await passwordKey(PW, saltOf(other.lock.wrappedPrivateKey)));
    expect(await openPage(page, otherKey!)).toBeNull();

    const key = (await unwrapPrivateKey(lock.wrappedPrivateKey, await passwordKey(PW, saltOf(lock.wrappedPrivateKey))))!;
    const parts = page.cipher.split(".");
    const body = unb64(parts[3]);
    body[0] ^= 1;
    expect(await openPage({ ...page, cipher: [...parts.slice(0, 3), b64(body)].join(".") }, key)).toBeNull();
    // A page's cipher is bound to its id: copied onto another page, it doesn't open.
    expect(await openPage({ ...page, id: "pub-2" }, key)).toBeNull();
  });

  test("opens the title with the page, and on its own for a list, bound to the page's id", async () => {
    const { lock, page } = sealedPage();
    const key = (await unwrapPrivateKey(lock.wrappedPrivateKey, await passwordKey(PW, saltOf(lock.wrappedPrivateKey))))!;
    expect((await openPage(page, key))?.title).toBe("Zanzibar plans");
    expect(await openTitle({ id: page.id, titleCipher: page.titleCipher, sealedKey: page.sealedKey }, key)).toBe("Zanzibar plans");
    expect(await openTitle({ id: "pub-2", titleCipher: page.titleCipher, sealedKey: page.sealedKey }, key)).toBeNull();
    // Encrypted before titles were: the page opens, without one.
    expect((await openPage({ ...page, titleCipher: null }, key))?.title).toBeNull();
  });
});
