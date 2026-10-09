import { scryptAsync } from "@noble/hashes/scrypt";
import type { Node } from "@/db/app-schema";

/**
 * The reader's side of encrypted pages, in the browser with WebCrypto, so the password and the page
 * never reach the server. It reads exactly what lib/encryption.ts writes ("v1.{part}…", base64url):
 *
 * - The password's key: scrypt(password, salt), which opens the password's wrapped X25519 private key.
 * - The unlock proof: HKDF of that key, sent instead of the password. The server keeps only its hash.
 * - A page's content key, sealed to the password's public key, and the page's tree under that key.
 *
 * No server-only imports: tests run it against the server's output.
 */

const subtle = () => globalThis.crypto.subtle;
const utf8 = (s: string) => new TextEncoder().encode(s);

export function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function b64(bytes: Uint8Array) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Must match lib/encryption.ts.
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, dkLen: 32 };

/** The salt of a wrapped private key ("v1.{salt}.{iv}.{tag}.{body}"), which the reader needs before typing. */
export const saltOf = (wrapped: string) => wrapped.split(".")[1] ?? "";

/** The password's key. Costs a deliberately slow scrypt; yields to the page while it runs. */
export async function passwordKey(password: string, salt: string): Promise<Uint8Array<ArrayBuffer>> {
  const key = await scryptAsync(utf8(password), unb64(salt), { ...SCRYPT, asyncTick: 20 });
  return new Uint8Array(key);
}

async function hkdf(ikm: Uint8Array<ArrayBuffer>, salt: Uint8Array<ArrayBuffer>, info: string) {
  const base = await subtle().importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await subtle().deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: utf8(info) }, base, 256);
  return new Uint8Array(bits);
}

/** What the reader sends to prove they know the password, without sending it. */
export const unlockProof = async (kek: Uint8Array<ArrayBuffer>) => b64(await hkdf(kek, new Uint8Array(), UNLOCK_PROOF_INFO));
export const UNLOCK_PROOF_INFO = "roam-publish:unlock-proof";

/** AES-256-GCM open of lib/encryption.ts's [iv, tag, body]. Null when the key is wrong or the data was changed. */
async function gcmOpen(key: Uint8Array<ArrayBuffer>, [iv, tag, body]: string[], aad: string) {
  try {
    const k = await subtle().importKey("raw", key, "AES-GCM", false, ["decrypt"]);
    const sealed = new Uint8Array([...unb64(body), ...unb64(tag)]);
    const plain = await subtle().decrypt({ name: "AES-GCM", iv: unb64(iv), additionalData: utf8(aad) }, k, sealed);
    return new Uint8Array(plain);
  } catch {
    return null;
  }
}

/**
 * The password's private key, unwrapped with its key and kept non-extractable: page scripts can use
 * it to open pages but can't read it out. Null when the key doesn't fit.
 */
export async function unwrapPrivateKey(wrapped: string, kek: Uint8Array<ArrayBuffer>): Promise<CryptoKey | null> {
  const [v, , ...parts] = wrapped.split(".");
  if (v !== "v1" || parts.length !== 3) return null;
  const der = await gcmOpen(kek, parts, "lock-key");
  if (!der) return null;
  return subtle().importKey("pkcs8", der, { name: "X25519" }, false, ["deriveBits"]);
}

/** A page's content key, sealed to the password's public key ("v1.{ephemeral}.{iv}.{tag}.{body}"). */
export async function openContentKey(sealed: string, privateKey: CryptoKey) {
  const [v, eph, ...parts] = sealed.split(".");
  if (v !== "v1" || parts.length !== 3) return null;
  try {
    const ephPub = unb64(eph);
    const sender = await subtle().importKey("spki", ephPub, { name: "X25519" }, false, []);
    const shared = new Uint8Array(await subtle().deriveBits({ name: "X25519", public: sender }, privateKey, 256));
    return gcmOpen(await hkdf(shared, ephPub, "roam-publish:content-key"), parts, "content-key");
  } catch {
    return null;
  }
}

/** A page's tree. Null when the content key doesn't open it. */
export async function decryptTree(contentKey: Uint8Array<ArrayBuffer>, cipher: string, publicationId: string): Promise<Node | null> {
  const [v, ...parts] = cipher.split(".");
  const plain = v === "v1" && parts.length === 3 ? await gcmOpen(contentKey, parts, `tree:${publicationId}`) : null;
  return plain ? (JSON.parse(new TextDecoder().decode(plain)) as Node) : null;
}

/** A page's title, encrypted under its content key. Null when the key doesn't open it. */
export async function decryptTitle(contentKey: Uint8Array<ArrayBuffer>, titleCipher: string, publicationId: string) {
  const [v, ...parts] = titleCipher.split(".");
  const plain = v === "v1" && parts.length === 3 ? await gcmOpen(contentKey, parts, `title:${publicationId}`) : null;
  return plain ? new TextDecoder().decode(plain) : null;
}

/**
 * What a reader's browser needs to show an encrypted page's title: its title cipher and its content
 * key sealed to one password. Small enough to send with every card in a list.
 */
export type SealedTitle = { id: string; titleCipher: string; sealedKey: string };

/** Opens a page's title with a password's private key. */
export async function openTitle(page: SealedTitle, privateKey: CryptoKey) {
  const ck = await openContentKey(page.sealedKey, privateKey);
  return ck && decryptTitle(ck, page.titleCipher, page.id);
}

/**
 * What a reader's browser needs to open an encrypted page: its cipher and its content key sealed to
 * one password, and its title cipher, unless it was encrypted before titles were.
 */
export type SealedPage = { id: string; cipher: string; titleCipher?: string | null; sealedKey: string };

/** Opens a page with a password's private key: its sealed content key, then its tree and title (null when not encrypted). */
export async function openPage(page: SealedPage, privateKey: CryptoKey): Promise<{ tree: Node; title: string | null } | null> {
  const ck = await openContentKey(page.sealedKey, privateKey);
  const tree = ck && (await decryptTree(ck, page.cipher, page.id));
  if (!ck || !tree) return null;
  return { tree, title: page.titleCipher ? await decryptTitle(ck, page.titleCipher, page.id) : null };
}
