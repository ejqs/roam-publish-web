"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { isAPIError } from "better-auth/api";
import { db } from "@/db";
import { account } from "@/db/schema";
import { credential, hasPassword } from "@/lib/account-password";
import { auth } from "@/lib/auth";
import { PASSWORD_MIN } from "@/lib/sign-in-link";
import { rateLimit } from "@/lib/rate-limit";
import { withAction } from "@/lib/telemetry";

/**
 * The optional account password (Settings). Everyone can log in with an emailed link; a password is
 * an extra way in that a person turns on here, and can change or remove while signed in. Better Auth
 * keeps it as the `credential` row in `account`.
 */

export type PasswordResult = { ok: true } | { ok: false; message: string };

const expired: PasswordResult = { ok: false, message: "Your session expired. Log in again." };
const tooShort: PasswordResult = { ok: false, message: `Use at least ${PASSWORD_MIN} characters.` };

async function signedIn() {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  return session ? { h, userId: session.user.id } : null;
}


export async function setAccountPassword(newPassword: string): Promise<PasswordResult> {
  return withAction("account.setPassword", async () => {
    const me = await signedIn();
    if (!me) return expired;
    if (newPassword.length < PASSWORD_MIN) return tooShort;
    if (!rateLimit(`password:user:${me.userId}`, 10, 15 * 60 * 1000))
      return { ok: false, message: "Too many tries. Try again in a few minutes." };
    if (await hasPassword(me.userId)) return { ok: false, message: "You already have a password. Change it instead." };
    // A credential row without a password (left by an old, half-finished sign-up) would block setPassword.
    await db.delete(account).where(credential(me.userId));
    try {
      await auth.api.setPassword({ body: { newPassword }, headers: me.h });
    } catch (e) {
      return { ok: false, message: isAPIError(e) ? e.message : "Could not set your password." };
    }
    revalidatePath("/settings");
    return { ok: true };
  });
}

export async function changeAccountPassword(currentPassword: string, newPassword: string): Promise<PasswordResult> {
  return withAction("account.changePassword", async () => {
    const me = await signedIn();
    if (!me) return expired;
    if (newPassword.length < PASSWORD_MIN) return tooShort;
    if (!rateLimit(`password:user:${me.userId}`, 10, 15 * 60 * 1000))
      return { ok: false, message: "Too many tries. Try again in a few minutes." };
    try {
      // Logs out everywhere else; this browser gets a new session.
      await auth.api.changePassword({ body: { currentPassword, newPassword, revokeOtherSessions: true }, headers: me.h });
    } catch (e) {
      if (isAPIError(e) && e.body?.code === "INVALID_PASSWORD")
        return { ok: false, message: "Current password is wrong. Forgot it? Remove it and set a new one." };
      return { ok: false, message: isAPIError(e) ? e.message : "Could not change your password." };
    }
    revalidatePath("/settings");
    return { ok: true };
  });
}

export async function removeAccountPassword(): Promise<PasswordResult> {
  return withAction("account.removePassword", async () => {
    const me = await signedIn();
    if (!me) return expired;
    await db.delete(account).where(credential(me.userId));
    revalidatePath("/settings");
    return { ok: true };
  });
}
