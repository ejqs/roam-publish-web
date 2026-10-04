"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { graph } from "@/db/schema";
import { canStoreTokens, encryptToken } from "@/lib/append-token";
import { auth } from "@/lib/auth";
import { setChangeLogPaused, validTimeZone } from "@/lib/changelog";
import { OPTIONAL_CATEGORIES, type OptionalCategory } from "@/lib/changelog-categories";
import { rateLimit } from "@/lib/rate-limit";
import { appendToDailyNote } from "@/lib/roam-append";
import type { FormState } from "../../actions";
import { withAction } from "@/lib/telemetry";

const Input = z.object({
  token: z.string().trim().startsWith("roam-graph-token-", "Tokens start with roam-graph-token-"),
  date: z.string().regex(/^\d{2}-\d{2}-\d{4}$/),
  timeZone: z.string().max(64),
});

async function ownedGraph(graphId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const g = await db.query.graph.findFirst({ where: and(eq(graph.id, graphId), eq(graph.userId, session.user.id)) });
  return g ? { g, userId: session.user.id } : null;
}

/**
 * Stores an append-only token for the change log. It's checked first by appending one block to
 * today's daily note, the same way the graph was verified.
 */
export async function setAppendToken(graphId: string, input: z.input<typeof Input>): Promise<FormState> {
  return withAction("dashboard.changelog.setAppendToken", async () => {
    const owned = await ownedGraph(graphId);
    if (!owned) return { ok: false, message: "Graph not found." };
    if (!canStoreTokens()) return { ok: false, message: "The change log isn't available on this server yet." };
    const parsed = Input.safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    if (!rateLimit(`append-token:user:${owned.userId}`, 10, 15 * 60 * 1000))
      return { ok: false, message: "Too many attempts. Try again in a few minutes." };

    const { token, date, timeZone } = parsed.data;
    const result = await appendToDailyNote(owned.g.name, token, date, "roam.pub change log connected (safe to delete)");
    if (!result.ok) return { ok: false, message: result.message };
    await db
      .update(graph)
      .set({
        appendTokenEnc: encryptToken(token),
        appendTokenStatus: "ok",
        appendTokenAddedAt: new Date(),
        appendTokenOkAt: new Date(),
        changeLogPaused: false,
        ...(validTimeZone(timeZone) && { timeZone }),
      })
      .where(eq(graph.id, graphId));
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: "Token saved. The change log is on." };
  });
}

export async function removeAppendToken(graphId: string): Promise<FormState> {
  return withAction("dashboard.changelog.removeAppendToken", async () => {
    const owned = await ownedGraph(graphId);
    if (!owned) return { ok: false, message: "Graph not found." };
    await db
      .update(graph)
      .set({
        appendTokenEnc: null,
        appendTokenStatus: null,
        appendTokenAddedAt: null,
        appendTokenOkAt: null,
        changeLogPaused: false,
      })
      .where(eq(graph.id, graphId));
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: "Token removed. You can revoke it in Roam too." };
  });
}

/** Turns the change log off or back on, keeping the stored token. */
export async function setChangeLogOn(graphId: string, on: boolean): Promise<FormState> {
  return withAction("dashboard.changelog.setChangeLogOn", async () => {
    const owned = await ownedGraph(graphId);
    if (!owned) return { ok: false, message: "Graph not found." };
    if (!(await setChangeLogPaused(graphId, !on)))
      return { ok: false, message: "Add an append-only token first." };
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: on ? "Change log is on." : "Change log is off. The token is kept." };
  });
}

const Options = z.object({
  off: z.array(z.enum(OPTIONAL_CATEGORIES.map((c) => c.id) as [OptionalCategory, ...OptionalCategory[]])).max(10),
  merge: z.boolean(),
  byDay: z.boolean(),
});

/** What goes into the change log: kinds of change left out, merging quick changes, grouping by day. */
export async function setChangeLogOptions(
  graphId: string,
  input: { off: string[]; merge: boolean; byDay: boolean },
): Promise<FormState> {
  return withAction("dashboard.changelog.setChangeLogOptions", async () => {
    const owned = await ownedGraph(graphId);
    if (!owned) return { ok: false, message: "Graph not found." };
    const parsed = Options.safeParse(input);
    if (!parsed.success) return { ok: false, message: "Those options aren't valid." };
    const { off, merge, byDay } = parsed.data;
    await db
      .update(graph)
      .set({ changeLogOff: [...new Set(off)], changeLogMerge: merge, changeLogByDay: byDay })
      .where(eq(graph.id, graphId));
    revalidatePath("/dashboard", "layout");
    return { ok: true, message: "Saved." };
  });
}
