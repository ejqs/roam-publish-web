"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { graph } from "@/db/schema";
import { auth } from "@/lib/auth";
import { isBlocked } from "@/lib/deletion";
import { rateLimit } from "@/lib/rate-limit";
import { appendToDailyNote } from "@/lib/roam-append";

// Routes that would shadow /{graph} or /dashboard/{graph}.
const ROUTES = new Set([
  "admin", "api", "c", "collection", "collections", "dashboard", "discover", "forgot-password",
  "invites", "keys", "login", "onboarding", "report", "reset-password", "setup", "signup", "u",
  "verify-email",
]);

const Input = z.object({
  graphName: z
    .string()
    .trim()
    .min(1, "Enter your graph name")
    .max(200)
    .regex(/^[A-Za-z0-9_-]+$/, "Graph names only contain letters, numbers, - and _")
    .refine((n) => !ROUTES.has(n.toLowerCase()), "This graph name can't be published on roam.pub."),
  token: z.string().trim().startsWith("roam-graph-token-", "Tokens start with roam-graph-token-"),
  date: z.string().regex(/^\d{2}-\d{2}-\d{4}$/),
});

export type VerifyResult = { ok: true; graphId: string; graphName: string } | { ok: false; error: string };

const TAKEN = "This graph is already on roam.pub. Ask its owner to invite you from their dashboard.";

/**
 * Verifies a graph by writing one block to its daily note with the user's append-only token. Roam
 * only gives a graph's tokens to its admins and rejects a token used on another graph, so a write
 * that succeeds proves control of the graph. The first account to verify a graph owns it here.
 */
export async function verifyGraph(input: z.input<typeof Input>): Promise<VerifyResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Your session expired. Please log in again." };

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { graphName, token, date } = parsed.data;

  if (!rateLimit(`verify:user:${session.user.id}`, 10, 15 * 60 * 1000))
    return { ok: false, error: "Too many attempts. Try again in a few minutes." };

  const owner = await db.query.graph.findFirst({ where: eq(graph.name, graphName) });
  if (owner && owner.userId !== session.user.id) return { ok: false, error: TAKEN };
  // Its account was deleted while a moderator had acted on it; see src/lib/deletion.ts.
  if (!owner && (await isBlocked("graph", graphName)))
    return { ok: false, error: "This graph can't be connected. Contact us if you think this is a mistake." };

  const result = await appendToDailyNote(
    graphName,
    token,
    date,
    "roam.pub connected this graph (safe to delete)",
  );
  // The token is not stored anywhere; it goes out of scope here.
  if (!result.ok) return { ok: false, error: result.message };

  const [g] = await db
    .insert(graph)
    .values({ userId: session.user.id, name: graphName })
    .onConflictDoUpdate({
      target: graph.name,
      set: { verifiedAt: new Date() },
      // Someone else verified it in the meantime: leave their graph alone.
      setWhere: eq(graph.userId, session.user.id),
    })
    .returning({ id: graph.id, name: graph.name });
  if (!g) return { ok: false, error: TAKEN };

  revalidatePath("/dashboard", "layout");
  return { ok: true, graphId: g.id, graphName: g.name };
}
