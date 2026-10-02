import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Roam append-only tokens are stored AES-256-GCM encrypted with APPEND_TOKEN_KEY (32 bytes,
 * base64). Stored as "v1.{iv}.{tag}.{ciphertext}", each part base64url. Plaintext tokens are never
 * logged or sent back to the browser.
 *
 * Rotating the key: set APPEND_TOKEN_KEY_PREVIOUS to the old key and APPEND_TOKEN_KEY to the new
 * one, deploy, run `bun run tokens:rotate`, then remove APPEND_TOKEN_KEY_PREVIOUS. Until then,
 * tokens still encrypted with the old key keep working.
 */
function parseKey(name: string) {
  const raw = process.env[name];
  const k = raw ? Buffer.from(raw, "base64") : null;
  if (!k || k.length !== 32) throw new Error(`${name} must be 32 bytes, base64-encoded`);
  return k;
}

const key = () => parseKey("APPEND_TOKEN_KEY");

/** The current key, then the previous one while a rotation is under way. */
function decryptionKeys() {
  const keys = [key()];
  if (process.env.APPEND_TOKEN_KEY_PREVIOUS) keys.push(parseKey("APPEND_TOKEN_KEY_PREVIOUS"));
  return keys;
}

/** False when the server has no key configured, so tokens can't be stored. */
export function canStoreTokens() {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), ct].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/**
 * The token and whether it was encrypted with the current key, or null when it can't be decrypted
 * (unknown key, or tampered with).
 */
export function openToken(stored: string): { token: string; current: boolean } | null {
  const [v, iv, tag, ct] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !ct) return null;
  const keys = decryptionKeys();
  for (const [i, k] of keys.entries()) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      const token = Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
      return { token, current: i === 0 };
    } catch {
      // Try the next key.
    }
  }
  return null;
}

export const decryptToken = (stored: string) => openToken(stored)?.token ?? null;
