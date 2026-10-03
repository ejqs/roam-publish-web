"use server";

import { and, eq, gt, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { collectionEntry, profile, publication, report, usernameAlias } from "@/db/schema";
import { auth } from "@/lib/auth";
import { sha256 } from "@/lib/content-hash";
import { loadCollection } from "@/lib/collections";
import { loadGraph } from "@/lib/graphs";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { reportReasons } from "@/lib/report-reasons";
import { withAction } from "@/lib/telemetry";

export type ReportState = { ok: boolean; message: string } | null;

const Input = z.object({
  graphName: z.string().min(1).max(200).optional(),
  rootUid: z.string().max(64).optional(),
  username: z.string().min(1).max(64).optional(),
  collectionSlug: z.string().min(1).max(64).optional(),
  entryUid: z.string().max(64).optional(),
  reason: z.enum(reportReasons, {
    error: "Choose a reason.",
  }),
  details: z.string().trim().max(2000, "Keep details under 2000 characters."),
  email: z.union([z.literal(""), z.email("Enter a valid email or leave it blank.")]),
});

const GONE: ReportState = { ok: false, message: "That page no longer exists." };

/** Current owner of a username, following renames. */
async function profileOwner(username: string) {
  const p = await db.query.profile.findFirst({ where: eq(profile.username, username) });
  if (p) return p.userId;
  const alias = await db.query.usernameAlias.findFirst({ where: eq(usernameAlias.username, username) });
  return alias?.userId ?? null;
}

const DAY = 24 * 60 * 60 * 1000;
const THANKS: ReportState = { ok: true, message: "Thanks. A moderator will review this report." };

export async function submitReport(_prev: ReportState, formData: FormData): Promise<ReportState> {
  return withAction("report.submitReport", async () => {
    // Honeypot: real visitors never see or fill this field.
    if (formData.get("website")) return THANKS;

    const parsed = Input.safeParse({
      graphName: formData.get("graphName") || undefined,
      rootUid: formData.get("rootUid") || undefined,
      username: formData.get("username") || undefined,
      collectionSlug: formData.get("collectionSlug") || undefined,
      entryUid: formData.get("entryUid") || undefined,
      reason: formData.get("reason"),
      details: formData.get("details") ?? "",
      email: formData.get("email") ?? "",
    });
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const r = parsed.data;
    if ([r.graphName, r.username, r.collectionSlug].filter(Boolean).length !== 1)
      return { ok: false, message: "Invalid report." };

    const h = await headers();
    const ip = clientIp(h);
    if (!rateLimit(`report:ip:${ip}`, 5, 15 * 60 * 1000))
      return { ok: false, message: "Too many reports. Try again later." };

    let graphId: string | null = null;
    let publicationId: string | null = null;
    let profileUserId: string | null = null;
    let collectionId: string | null = null;
    if (r.collectionSlug) {
      const c = await loadCollection(r.collectionSlug);
      if (!c) return GONE;
      collectionId = c.id;
      if (r.entryUid) {
        const entry = await db.query.collectionEntry.findFirst({
          where: and(eq(collectionEntry.collectionId, c.id), eq(collectionEntry.entryUid, r.entryUid.toLowerCase())),
        });
        if (!entry) return GONE;
        publicationId = entry.publicationId;
      }
    } else if (r.username) {
      profileUserId = await profileOwner(r.username.toLowerCase());
      if (!profileUserId) return { ok: false, message: "That profile no longer exists." };
    } else {
      const g = await loadGraph(r.graphName!);
      if (!g) return GONE;
      graphId = g.id;
      if (r.rootUid) {
        const pub = await db.query.publication.findFirst({
          where: and(eq(publication.graphId, g.id), eq(publication.rootUid, r.rootUid)),
        });
        if (!pub) return GONE;
        publicationId = pub.id;
      }
    }

    const ipHash = sha256(`report:${ip}`);
    // One report per visitor, target and reason a day; repeats just get the same thanks.
    const dupe = await db.query.report.findFirst({
      where: and(
        eq(report.ipHash, ipHash),
        profileUserId
          ? eq(report.profileUserId, profileUserId)
          : collectionId
            ? and(
                eq(report.collectionId, collectionId),
                publicationId ? eq(report.publicationId, publicationId) : isNull(report.publicationId),
              )
            : and(
              eq(report.graphId, graphId!),
              publicationId ? eq(report.publicationId, publicationId) : isNull(report.publicationId),
            ),
        eq(report.reason, r.reason),
        gt(report.createdAt, new Date(Date.now() - DAY)),
      ),
    });
    if (dupe) return THANKS;

    const session = await auth.api.getSession({ headers: h });
    await db.insert(report).values({
      graphId,
      collectionId,
      publicationId,
      profileUserId,
      reason: r.reason,
      details: r.details,
      reporterEmail: r.email || session?.user.email || null,
      reporterUserId: session?.user.id ?? null,
      ipHash,
    });
    return THANKS;
  });
}
