/**
 * When a button or switch on the dashboard may be used. Each rule returns why it can't be, or
 * undefined when it can. The control shows that reason and stays disabled; the server action runs
 * the same rule and refuses with the same words, so the two never drift apart. Shared by server and
 * client, so nothing here touches the database.
 *
 * Related rules live beside their feature: lib/encryption-rules.ts (passwords that encrypt) and
 * lib/discover-rules.ts (what may stay on Discover), lib/folders.ts (Save on Arrange).
 */
import { ENCRYPT_PASSWORD_MIN } from "./encryption-rules";

export { decryptExistingPagesBlocked, encryptExistingPagesBlocked, encryptNewPagesBlocked } from "./encryption-rules";
export { arrangeBlocked } from "./folders";

type Kind = "graph" | "collection";
type Access = "open" | "password" | "members";

/** A graph's or collection's access settings as its settings form would save them. */
export type ContainerAccessChange = {
  indexAccess: Access;
  defaultAccess: Access;
  /** A new password, or "" to keep the current one. */
  password: string;
  clearPassword: boolean;
  currentPassword?: string;
  resetEncrypted?: boolean;
};

/** Save on a graph's or collection's access settings. `encryptedPages`: how many encrypted pages its password opens. */
export function saveContainerAccessBlocked(kind: Kind, value: ContainerAccessChange, hasPassword: boolean, encryptedPages: number) {
  const willHavePassword = value.password ? true : value.clearPassword ? false : hasPassword;
  if ((value.indexAccess === "password" || value.defaultAccess === "password") && !willHavePassword)
    return `Set a ${kind} password to use Password access.`;
  if (encryptedPages > 0 && value.password && value.password.length < ENCRYPT_PASSWORD_MIN)
    return `The new password opens encrypted pages, so it needs at least ${ENCRYPT_PASSWORD_MIN} characters.`;
  if (encryptedPages > 0 && value.password && !value.resetEncrypted && !value.currentPassword)
    return `Enter the current ${kind} password to change it.`;
}

/** Save on a collection's settings: its name, then its access. */
export function saveCollectionBlocked(name: string, value: ContainerAccessChange, hasPassword: boolean, encryptedPages: number) {
  if (!name.trim()) return "Give the collection a name.";
  return saveContainerAccessBlocked("collection", value, hasPassword, encryptedPages);
}

/** Removing a page from its graph: a page has to be published somewhere. */
export function hideFromGraphBlocked(collections: number) {
  if (collections === 0) return "Add it to a collection first, or unpublish it instead.";
}

/**
 * Unlisted, Listed or Discoverable for a page's graph place: a page that's only in collections has
 * none, so it's listed in each collection instead.
 */
export function graphListingBlocked(inGraph: boolean) {
  if (!inGraph) return "This page is only in collections, so it's listed, or not, in each collection on roam.pub.";
}

/** Set or Change on a page's own password in one place. */
export function setPlacePasswordBlocked(password: string, encrypted: boolean) {
  if (!password) return "Enter a password.";
  if (encrypted && password.length < ENCRYPT_PASSWORD_MIN)
    return `At least ${ENCRYPT_PASSWORD_MIN} characters, because this page is encrypted.`;
}

/** Removing a page's own password while it uses Password there: only with a graph or collection password to fall back on. */
export function removeOwnPasswordBlocked(container: { label: string; hasPassword: boolean }) {
  if (!container.hasPassword) return `${container.label} has no password, so it stays while this page uses Password.`;
}
