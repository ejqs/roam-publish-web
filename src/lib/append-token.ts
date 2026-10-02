import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Roam append-only tokens are stored AES-256-GCM encrypted with APPEND_TOKEN_KEY (32 bytes,
 * base64). Stored as "v1.{iv}.{tag}.{ciphertext}", each part base64url. Plaintext tokens are never
 * logged or sent back to the browser.
 */
function key() {
  const raw = process.env.APPEND_TOKEN_KEY;
  const k = raw ? Buffer.from(raw, "base64") : null;
  if (!k || k.length !== 32) throw new Error("APPEND_TOKEN_KEY must be 32 bytes, base64-encoded");
  return k;
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

/** Null when the stored value can't be decrypted (wrong key, or tampered with). */
export function decryptToken(stored: string) {
  const [v, iv, tag, ct] = stored.split(".");
  if (v !== "v1" || !iv || !tag || !ct) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
