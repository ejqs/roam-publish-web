import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import type { Access, PlaceAccess, PlaceViews, ShowAuthor, ViewsMode } from "@/db/schema";

export { showsViewCountries, viewsMode } from "./views";

/**
 * Access for graphs, collections and the pages in them.
 *
 * A container (graph or collection) has `indexAccess` for its front page and `defaultAccess` for
 * its pages. A page's own `access` replaces the default instead of stacking on it, so a page can be
 * open inside a password-protected collection (a shareable link) or protected inside an open graph.
 */

export type Container = {
  kind: "graph" | "collection";
  id: string;
  indexAccess: Access;
  defaultAccess: Access;
  passwordHash: string | null;
  passwordVersion: number;
  showAuthors: boolean;
  views: ViewsMode;
  showViewCountries: boolean;
};

export type Place = {
  kind: "publication" | "entry";
  id: string;
  access: PlaceAccess;
  passwordHash: string | null;
  passwordVersion: number;
  showAuthor: ShowAuthor;
  views: PlaceViews;
  showViewCountries: ShowAuthor;
};

export const effectiveAccess = (c: Container, p: Pick<Place, "access">): Access =>
  p.access === "inherit" ? c.defaultAccess : p.access;

export const showsAuthor = (c: Container, p: Pick<Place, "showAuthor">) =>
  p.showAuthor === "inherit" ? c.showAuthors : p.showAuthor === "show";

/** What unlocks a password: the page's own password when it has one, else its container's. */
export type Lock = { scope: "graph" | "collection" | "publication" | "entry"; id: string; version: number };

export function pageLock(c: Container, p: Place): Lock | null {
  if (p.passwordHash) return { scope: p.kind, id: p.id, version: p.passwordVersion };
  if (c.passwordHash) return { scope: c.kind, id: c.id, version: c.passwordVersion };
  return null;
}

export const containerLock = (c: Container): Lock | null =>
  c.passwordHash ? { scope: c.kind, id: c.id, version: c.passwordVersion } : null;

export type Viewer = {
  /** Owner or member of the container. */
  member: boolean;
  /** Can manage this page; managers always read what they manage. */
  manager: boolean;
  signedIn: boolean;
};

/** Why the reader can't see something yet, or null when they can. */
export type Blocker =
  /** `encrypted`: everyone needs the password, members too; `again`: they unlocked before it was encrypted. */
  | { need: "password"; lock: Lock | null; encrypted?: boolean; again?: boolean }
  | { need: "signin" }
  | { need: "member" }
  /** Encrypted, and a password it was encrypted with was reset: unreadable here until republished. */
  | { need: "republish" }
  | null;

export async function gate(access: Access, lock: Lock | null, viewer: Viewer): Promise<Blocker> {
  if (viewer.manager || viewer.member) return null;
  if (access === "open") return null;
  if (access === "members") return viewer.signedIn ? { need: "member" } : { need: "signin" };
  if (lock && (await isUnlocked(lock))) return null;
  return { need: "password", lock };
}

// --- Passwords ---------------------------------------------------------------------------------

const PASSWORD_MIN = 4;
export const Password = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(200, "Keep it under 200 characters.");

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 32);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}

// --- Unlock cookies ----------------------------------------------------------------------------

const UNLOCK_DAYS = 30;
const cookieName = (l: Pick<Lock, "scope" | "id">) => `rp_unlock_${l.scope}_${l.id}`;

/** Bound to the password version, so changing the password signs everyone out. */
function unlockValue(l: Lock) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return createHmac("sha256", secret).update(`unlock:${l.scope}:${l.id}:${l.version}`).digest("base64url");
}

export async function isUnlocked(l: Lock) {
  const value = (await cookies()).get(cookieName(l))?.value;
  if (!value) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(unlockValue(l));
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Only from a server action or route handler. */
export async function setUnlocked(l: Lock) {
  (await cookies()).set(cookieName(l), unlockValue(l), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: UNLOCK_DAYS * 24 * 60 * 60,
  });
}
