"use server";

import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { graph, graphVerification } from "@/db/schema";
import { auth } from "@/lib/auth";
import { sha256 } from "@/lib/content-hash";
import { rateLimit } from "@/lib/rate-limit";
import { appendToDailyNote } from "@/lib/roam-append";

// Top-level routes that would shadow /{graph}.
const ROUTES = new Set([
  "admin", "api", "dashboard", "forgot-password", "login", "onboarding", "report",
  "reset-password", "signup", "u", "verify-email",
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

export type StartResult =
  | { ok: true; verificationId: string; graphName: string }
  | { ok: false; error: string };

export async function startVerification(input: z.input<typeof Input>): Promise<StartResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Your session expired. Please log in again." };

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { graphName, token, date } = parsed.data;

  if (!rateLimit(`verify:user:${session.user.id}`, 10, 15 * 60 * 1000))
    return { ok: false, error: "Too many attempts. Try again in a few minutes." };

  const owner = await db.query.graph.findFirst({ where: eq(graph.name, graphName) });
  if (owner && owner.userId !== session.user.id)
    return { ok: false, error: "This graph is already linked to another account." };

  const code = randomBytes(32).toString("base64url"); // 43 chars, 256 bits
  const result = await appendToDailyNote(
    graphName,
    token,
    date,
    `verify-roam-publish (deletable after onboarding): ${code}`,
  );
  // The token is not stored anywhere; it goes out of scope here.
  if (!result.ok) return { ok: false, error: result.message };

  const [v] = await db
    .insert(graphVerification)
    .values({
      userId: session.user.id,
      graphName,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    })
    .returning({ id: graphVerification.id });

  return { ok: true, verificationId: v.id, graphName };
}

export async function checkVerification(verificationId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { consumed: false, expired: true };
  const v = await db.query.graphVerification.findFirst({
    where: and(
      eq(graphVerification.id, verificationId),
      eq(graphVerification.userId, session.user.id),
    ),
  });
  if (!v) return { consumed: false, expired: true };
  return { consumed: !!v.consumedAt, expired: v.expiresAt < new Date() };
}
