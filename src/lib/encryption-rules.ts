/** Shared by server and client (so not in lib/encryption.ts, which needs node:crypto and the database). */

/** Passwords that protect encrypted pages need at least this many characters. */
export const ENCRYPT_PASSWORD_MIN = 10;

/** Why "Encrypt new password pages" can't be saved with the password a graph or collection has. */
export const encryptNewPagesBlocked = (kind: "graph" | "collection") =>
  `Encrypting new pages needs a ${kind} password of at least ${ENCRYPT_PASSWORD_MIN} characters. Enter the password again, or set a longer one, to encrypt with it.`;

/** Why "Decrypt existing pages" can't check or decrypt yet: it needs the password they share. */
export function decryptExistingPagesBlocked(password: string) {
  if (!password) return "Enter the password the pages are encrypted with.";
}

/**
 * Why "Encrypt existing pages" can't be used yet. It encrypts with the saved password, so it waits
 * for one with a key pair (`canEncrypt`) and for unsaved password changes to be saved.
 */
export function encryptExistingPagesBlocked(kind: "graph" | "collection", s: { canEncrypt: boolean; unsavedPassword?: boolean }) {
  if (s.unsavedPassword) return `Save the new ${kind} password first.`;
  if (!s.canEncrypt)
    return `Needs a saved ${kind} password of at least ${ENCRYPT_PASSWORD_MIN} characters. Set one and save, or enter it again if it was set before encryption existed.`;
}

/** After adding an encrypted page somewhere without a password that opens it. */
export const OPENS_AFTER_REPUBLISH = (place: string) =>
  `It's encrypted, so it opens in ${place} once you republish it from Roam.`;

/** Why an encrypted page shows Needs republish. */
export const NEEDS_REPUBLISH =
  "Some places can't open it yet: it was added somewhere new, or a password it used was reset. Republish it from Roam to make it readable everywhere.";
