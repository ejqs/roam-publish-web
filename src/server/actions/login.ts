"use server";

import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { user } from "@/db/schema";
import { hasPassword } from "@/lib/account-password";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { withAction } from "@/lib/telemetry";

export type LoginOptions = { ok: true; password: boolean } | { ok: false; message: string };

/**
 * Log in's first step: whether this email's account has a password (Settings), so the form asks for
 * it, with an emailed link as the other choice. Everyone else gets a link straight away. It says yes
 * only for accounts that turned a password on, and is rate limited per address.
 */
export async function loginOptions(email: string): Promise<LoginOptions> {
  return withAction("auth.loginOptions", async () => {
    const ip = clientIp(await headers());
    if (!rateLimit(`login-options:ip:${ip}`, 30, 15 * 60 * 1000))
      return { ok: false, message: "Too many tries. Wait a few minutes and try again." };
    const row = await db.query.user.findFirst({
      where: eq(user.email, email.trim().toLowerCase()),
      columns: { id: true },
    });
    return { ok: true, password: !!row && (await hasPassword(row.id)) };
  });
}
