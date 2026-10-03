/** Shared by server and client (so not in lib/encryption.ts, which needs node:crypto and the database). */

/** Passwords that protect encrypted pages need at least this many characters. */
export const ENCRYPT_PASSWORD_MIN = 10;
