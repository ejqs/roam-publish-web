"use server";

import { eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { collection, collectionEntry, graph, passwordUnlock, publication } from "@/db/schema";
import { type Lock, setUnlocked, verifyPassword } from "@/lib/gates";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { withAction } from "@/lib/telemetry";

const Input = z.object({
  scope: z.enum(["graph", "collection", "publication", "entry"]),
  id: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
});

export type UnlockResult = { ok: boolean; message: string };

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

/** Checks a password and, if right, remembers the unlock on this browser for 30 days. */
export async function unlock(input: z.input<typeof Input>): Promise<UnlockResult> {
  return withAction("unlock.unlock", async () => {
    const parsed = Input.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Enter the password." };
    const { scope, id, password } = parsed.data;
    const h = await headers();
    const ip = clientIp(h);
    if (!rateLimit(`unlock:${ip}:${scope}:${id}`, 10, 15 * 60 * 1000))
      return { ok: false, message: "Too many tries. Wait a few minutes and try again." };
    const row = await current(scope, id);
    if (!row?.passwordHash || !verifyPassword(password, row.passwordHash))
      return { ok: false, message: "That password isn't right." };
    await setUnlocked({ scope, id, version: row.passwordVersion });
    // Counted for the page's managers: how many people got in with this password (lib/views-data.ts).
    await db
      .insert(passwordUnlock)
      .values({ scope, targetId: id, passwordVersion: row.passwordVersion, unlocks: 1 })
      .onConflictDoUpdate({
        target: [passwordUnlock.scope, passwordUnlock.targetId, passwordUnlock.passwordVersion],
        set: { unlocks: sql`${passwordUnlock.unlocks} + 1`, lastUnlockAt: new Date() },
      });
    return { ok: true, message: "Unlocked." };
  });
}
