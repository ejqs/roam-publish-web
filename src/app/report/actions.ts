"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { publication, report } from "@/db/schema";
import { auth } from "@/lib/auth";
import { sha256 } from "@/lib/content-hash";
import { loadGraph } from "@/lib/graphs";
import { rateLimit } from "@/lib/rate-limit";
import { reportReasons } from "@/lib/report-reasons";

export type ReportState = { ok: boolean; message: string } | null;

const Input = z.object({
  graphName: z.string().min(1).max(200),
  rootUid: z.string().max(64).optional(),
  reason: z.enum(reportReasons, {
    error: "Choose a reason.",
  }),
  details: z.string().trim().max(2000, "Keep details under 2000 characters."),
  email: z.union([z.literal(""), z.email("Enter a valid email or leave it blank.")]),
});

const DAY = 24 * 60 * 60 * 1000;
const THANKS: ReportState = { ok: true, message: "Thanks. A moderator will review this report." };

export async function submitReport(_prev: ReportState, formData: FormData): Promise<ReportState> {
  // Honeypot: real visitors never see or fill this field.
  if (formData.get("website")) return THANKS;

  const parsed = Input.safeParse({
    graphName: formData.get("graphName"),
    rootUid: formData.get("rootUid") || undefined,
    reason: formData.get("reason"),
    details: formData.get("details") ?? "",
    email: formData.get("email") ?? "",
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const r = parsed.data;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  if (!rateLimit(`report:ip:${ip}`, 5, 15 * 60 * 1000))
    return { ok: false, message: "Too many reports. Try again later." };

  const g = await loadGraph(r.graphName);
  if (!g) return { ok: false, message: "That page no longer exists." };
  let publicationId: string | null = null;
  if (r.rootUid) {
    const pub = await db.query.publication.findFirst({
      where: and(eq(publication.graphId, g.id), eq(publication.rootUid, r.rootUid)),
    });
    if (!pub) return { ok: false, message: "That page no longer exists." };
    publicationId = pub.id;
  }

  const ipHash = sha256(`report:${ip}`);
  // One report per visitor, target and reason a day; repeats just get the same thanks.
  const dupe = await db.query.report.findFirst({
    where: and(
      eq(report.ipHash, ipHash),
      eq(report.graphId, g.id),
      publicationId ? eq(report.publicationId, publicationId) : isNull(report.publicationId),
      eq(report.reason, r.reason),
      gt(report.createdAt, new Date(Date.now() - DAY)),
    ),
  });
  if (dupe) return THANKS;

  const session = await auth.api.getSession({ headers: h });
  await db.insert(report).values({
    graphId: g.id,
    publicationId,
    reason: r.reason,
    details: r.details,
    reporterEmail: r.email || session?.user.email || null,
    reporterUserId: session?.user.id ?? null,
    ipHash,
  });
  return THANKS;
}
