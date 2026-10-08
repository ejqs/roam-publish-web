"use server";

import "server-only";
import { eq, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { collection, collectionEntry, graph, passwordUnlock, publication } from "@/db/schema";
import { type ReaderKey, readerKeyFromPassword, readerKeyFromProof, unlockSaltOf } from "@/lib/encryption";
import { type Lock, setUnlocked, verifyPassword } from "@/lib/gates";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { withAction } from "@/lib/telemetry";

const LockInput = z.object({
  scope: z.enum(["graph", "collection", "publication", "entry"]),
  id: z.string().min(1).max(64),
});
const Input = LockInput.extend({ password: z.string().min(1).max(200) });
const ProofInput = LockInput.extend({ proof: z.string().regex(/^[\w-]{43}$/) });

export type UnlockResult = {
  ok: boolean;
  message: string;
  /** The password's wrapped private key, for the reader's browser to open encrypted pages with. */
  key?: ReaderKey;
  /** The password version the unlock is for, which the browser files the key under. */
  version?: number;
  /** The lock can't take a proof yet: send the password itself. */
  needPassword?: boolean;
};

async function current(scope: Lock["scope"], id: string) {
  const cols = { passwordHash: true, passwordVersion: true } as const;
  switch (scope) {
    case "graph":
      return db.query.graph.findFirst({ where: eq(graph.id, id), columns: cols });
    case "collection":
      return db.query.collection.findFirst({ where: eq(collection.id, id), columns: cols });
    case "publication":
      return db.query.publication.findFirst({ where: eq(publication.id, id), columns: cols });
    case "entry":
      return db.query.collectionEntry.findFirst({ where: eq(collectionEntry.id, id), columns: cols });
  }
}

const tooMany = (scope: string, id: string, ip: string) => !rateLimit(`unlock:${ip}:${scope}:${id}`, 10, 15 * 60 * 1000);
const TOO_MANY: UnlockResult = { ok: false, message: "Too many tries. Wait a few minutes and try again." };
const WRONG: UnlockResult = { ok: false, message: "That password isn't right." };

/** Remembers the unlock on this browser for 30 days and counts it. */
async function unlocked(l: Lock, key: ReaderKey | null): Promise<UnlockResult> {
  await setUnlocked(l);
  // Before encryption moved to readers' browsers, a cookie carried the password's key to the server.
  (await cookies()).delete(`rp_key_${l.scope}_${l.id}`);
  // Counted for the page's managers: how many people got in with this password (lib/views-data.ts).
  await db
    .insert(passwordUnlock)
    .values({ scope: l.scope, targetId: l.id, passwordVersion: l.version, unlocks: 1 })
    .onConflictDoUpdate({
      target: [passwordUnlock.scope, passwordUnlock.targetId, passwordUnlock.passwordVersion],
      set: { unlocks: sql`${passwordUnlock.unlocks} + 1`, lastUnlockAt: new Date() },
    });
  return { ok: true, message: "Unlocked.", version: l.version, ...(key && { key }) };
}

/**
 * The salt a browser derives the password's key with, so it can unlock with a proof instead of the
 * password. Null when the password has no key pair that takes proofs: send the password then.
 */
export async function unlockSalt(input: z.input<typeof LockInput>): Promise<{ salt: string | null }> {
  return withAction("unlock.salt", async () => {
    const parsed = LockInput.safeParse(input);
    return { salt: parsed.success ? await unlockSaltOf(parsed.data) : null };
  });
}

/**
 * Unlocks with a proof derived from the password in the reader's browser (lib/reader-crypto.ts), so
 * the password never reaches the server, and hands back the wrapped key encrypted pages open with.
 */
export async function unlockWithProof(input: z.input<typeof ProofInput>): Promise<UnlockResult> {
  return withAction("unlock.proof", async () => {
    const parsed = ProofInput.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Enter the password." };
    const { scope, id, proof } = parsed.data;
    if (tooMany(scope, id, clientIp(await headers()))) return TOO_MANY;
    const row = await current(scope, id);
    if (!row?.passwordHash) return WRONG;
    const key = await readerKeyFromProof({ scope, id }, proof);
    if (key === "password") return { ok: false, message: "Send the password.", needPassword: true };
    if (key === "wrong") return WRONG;
    return unlocked({ scope, id, version: row.passwordVersion }, key);
  });
}

/**
 * Checks a password itself and, if right, remembers the unlock on this browser for 30 days. For
 * passwords that can't take a proof yet; a long enough one is set up to take proofs from then on.
 */
export async function unlock(input: z.input<typeof Input>): Promise<UnlockResult> {
  return withAction("unlock.unlock", async () => {
    const parsed = Input.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Enter the password." };
    const { scope, id, password } = parsed.data;
    if (tooMany(scope, id, clientIp(await headers()))) return TOO_MANY;
    const row = await current(scope, id);
    if (!row?.passwordHash || !verifyPassword(password, row.passwordHash)) return WRONG;
    return unlocked({ scope, id, version: row.passwordVersion }, await readerKeyFromPassword({ scope, id }, password));
  });
}
