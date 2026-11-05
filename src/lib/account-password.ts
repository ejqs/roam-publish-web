import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";

/** Better Auth keeps an account password as the person's `credential` row in `account`. */
export const credential = (userId: string) =>
  and(eq(account.userId, userId), eq(account.providerId, "credential"));

/** Whether this person has turned on password log in (Settings). */
export async function hasPassword(userId: string) {
  const row = await db.query.account.findFirst({ where: credential(userId), columns: { password: true } });
  return !!row?.password;
}
