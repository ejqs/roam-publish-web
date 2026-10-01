import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { profile, usernameAlias } from "@/db/schema";

const RESERVED = new Set([
  "admin", "api", "app", "auth", "dashboard", "discover", "forgot-password", "help", "login", "logout",
  "me", "onboarding", "reset-password", "root", "roam", "settings", "setup", "signup", "support",
  "u", "verify-email", "www",
]);

export const Username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9_-]{2,29}$/, "3–30 characters: letters, numbers, - and _. Start with a letter or number.")
  .refine((u) => !RESERVED.has(u), "That username is reserved.");

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A name is free unless someone else holds it as a current or former username. */
export async function usernameTakenByOther(tx: Tx, username: string, userId: string) {
  const [current] = await tx
    .select({ userId: profile.userId })
    .from(profile)
    .where(and(eq(profile.username, username), ne(profile.userId, userId)))
    .limit(1);
  if (current) return true;
  const [alias] = await tx
    .select({ userId: usernameAlias.userId })
    .from(usernameAlias)
    .where(and(eq(usernameAlias.username, username), ne(usernameAlias.userId, userId)))
    .limit(1);
  return !!alias;
}

/**
 * Rename, keeping the old name as a permanent redirect (/u/{old} → /u/{new}).
 * Reclaiming one's own former name drops that alias. Meant for the admin area; users can't rename themselves.
 */
export async function renameUsername(userId: string, next: string) {
  return db.transaction(async (tx) => {
    const current = await tx.query.profile.findFirst({ where: eq(profile.userId, userId) });
    if (!current) return { ok: false as const, message: "That user hasn't claimed a username." };
    if (current.username === next) return { ok: true as const };
    if (await usernameTakenByOther(tx, next, userId))
      return { ok: false as const, message: "That username is taken." };

    await tx.delete(usernameAlias).where(eq(usernameAlias.username, next));
    await tx.insert(usernameAlias).values({ username: current.username, userId });
    await tx.update(profile).set({ username: next }).where(eq(profile.userId, userId));
    return { ok: true as const };
  });
}
