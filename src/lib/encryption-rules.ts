/** Shared by server and client (so not in lib/encryption.ts, which needs node:crypto and the database). */

/** Passwords that protect encrypted pages need at least this many characters. */
export const ENCRYPT_PASSWORD_MIN = 10;

/** Why "Encrypt new password pages" can't be saved with the password a graph or collection has. */
export const encryptNewPagesBlocked = (kind: "graph" | "collection") =>
  `Encrypting new pages needs a ${kind} password of at least ${ENCRYPT_PASSWORD_MIN} characters. Enter the password again, or set a longer one, to encrypt with it.`;
