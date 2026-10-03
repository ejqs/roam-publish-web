import { createHmac } from "node:crypto";

/**
 * HMAC-SHA256 under BETTER_AUTH_SECRET. Unlike a plain hash, it can't be reversed by hashing every
 * IP address or a list of known emails, since that needs the secret too. `purpose` keeps hashes made
 * for different uses from matching each other. Changing the secret changes every hash.
 */
export function keyedHash(purpose: string, value: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(`${purpose}:${value}`).digest("hex");
}
