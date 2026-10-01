import { timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { graph, graphVerification } from "@/db/schema";
import { auth } from "@/lib/auth";
import { sha256 } from "@/lib/content-hash";
import { json, preflight } from "@/lib/cors";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const Body = z.object({
  graphName: z.string().min(1).max(200),
  code: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

const WINDOW = 15 * 60 * 1000;

export const OPTIONS = preflight;

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json(req, { error: "Invalid request" }, 400);
  const { graphName, code } = parsed.data;

  if (
    !rateLimit(`claim:ip:${clientIp(req)}`, 10, WINDOW) ||
    !rateLimit(`claim:graph:${graphName}`, 10, WINDOW)
  ) {
    return json(req, { error: "Too many attempts. Try again later." }, 429);
  }

  const candidates = await db
    .select()
    .from(graphVerification)
    .where(
      and(
        eq(graphVerification.graphName, graphName),
        isNull(graphVerification.consumedAt),
        gt(graphVerification.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(graphVerification.createdAt))
    .limit(5);

  const codeHash = Buffer.from(sha256(code), "hex");
  const match = candidates.find((v) =>
    timingSafeEqual(Buffer.from(v.codeHash, "hex"), codeHash),
  );
  if (!match) return json(req, { error: "Verification not found or expired" }, 404);

  // Consume atomically so the code can only be used once.
  const consumed = await db
    .update(graphVerification)
    .set({ consumedAt: new Date() })
    .where(and(eq(graphVerification.id, match.id), isNull(graphVerification.consumedAt)))
    .returning();
  if (consumed.length === 0)
    return json(req, { error: "Verification not found or expired" }, 404);

  const existing = await db.query.graph.findFirst({ where: eq(graph.name, graphName) });
  if (existing && existing.userId !== match.userId) {
    return json(req, { error: "This graph is linked to another account" }, 409);
  }
  const [g] = existing
    ? await db
        .update(graph)
        .set({ verifiedAt: new Date() })
        .where(eq(graph.id, existing.id))
        .returning()
    : await db.insert(graph).values({ userId: match.userId, name: graphName }).returning();

  const key = await auth.api.createApiKey({
    body: {
      userId: match.userId,
      name: graphName.slice(0, 32),
      metadata: { graphId: g.id },
    },
  });

  return json(req, { apiKey: key.key, graphName });
}
