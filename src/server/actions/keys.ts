"use server";

import "server-only";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/db";
import { graph } from "@/db/schema";
import { auth } from "@/lib/auth";
import { graphRole } from "@/lib/graph-access";
import { issueKey, revokeKeys } from "@/lib/keys";
import { rateLimit } from "@/lib/rate-limit";
import { withAction } from "@/lib/telemetry";

export type KeyResult = { ok: true; key: string } | { ok: false; message: string };

/**
 * Creates this person's key for a graph they own or belong to, replacing any earlier one. The key is
 * returned once; only its hash is stored.
 */
export async function generateKey(graphId: string): Promise<KeyResult> {
  return withAction("dashboard.keys.generateKey", async () => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { ok: false, message: "Your session expired. Please log in again." };
    const userId = session.user.id;
    if (!rateLimit(`key:user:${userId}`, 10, 15 * 60 * 1000))
      return { ok: false, message: "Too many keys. Try again in a few minutes." };
    const g = await db.query.graph.findFirst({ where: eq(graph.id, graphId) });
    if (!g || !(await graphRole(userId, graphId))) return { ok: false, message: "Graph not found." };
    if (g.suspendedAt) return { ok: false, message: "This graph was suspended by a moderator." };
    const key = await issueKey(userId, g.id, g.name);
    revalidatePath("/dashboard/keys");
    return { ok: true, key };
  });
}

export async function revokeKey(graphId: string) {
  return withAction("dashboard.keys.revokeKey", async () => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return;
    await revokeKeys(session.user.id, graphId);
    revalidatePath("/dashboard/keys");
  });
}
