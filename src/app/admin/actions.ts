"use server";

import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import {
  graph,
  moderationAction,
  profile,
  publication,
  report,
  session as sessionTable,
  user,
  usernameAlias,
} from "@/db/schema";
import { isAdmin, requireAdmin } from "@/lib/admin";
import { DISCOVER_TAG } from "@/lib/discover";
import { graphPath } from "@/lib/graphs";
import type { ModerationNotice } from "@/lib/moderation-email-templates";
import { notifyOwner } from "@/lib/moderation-emails";
import { publicationUrl } from "@/lib/publications";
import { renameUsername, Username } from "@/lib/usernames";

export type ActionState = { ok: boolean; message: string } | null;

const OPS = ["remove", "restore", "suspend", "unsuspend", "ban", "unban", "dismiss"] as const;
export type ModerationOp = (typeof OPS)[number];

/** Taking something down needs a reason the owner will read; undoing it doesn't. */
const NEEDS_REASON = new Set<ModerationOp>(["remove", "suspend", "ban"]);

const Input = z.object({
  op: z.enum(OPS),
  targetId: z.string().min(1),
  reason: z.string().trim().max(2000),
  notify: z.boolean(),
});

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function revalidatePublic() {
  revalidatePath("/[graph]", "layout");
  revalidatePath("/u/[username]", "page");
  revalidatePath("/");
  updateTag(DISCOVER_TAG);
  revalidatePath("/dashboard", "layout");
  revalidatePath("/admin", "layout");
}

async function resolveReports(
  where: ReturnType<typeof and>,
  status: "actioned" | "dismissed",
  adminId: string,
) {
  await db
    .update(report)
    .set({ status, resolvedAt: new Date(), resolvedBy: adminId })
    .where(and(eq(report.status, "open"), where));
}

/** Every takedown, restore, ban and dismissal goes through here so each one is logged the same way. */
export async function moderate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = Input.safeParse({
    op: formData.get("op"),
    targetId: formData.get("targetId"),
    reason: formData.get("reason") ?? "",
    notify: formData.get("notify") === "on",
  });
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  const { op, targetId, reason, notify } = parsed.data;
  if (NEEDS_REASON.has(op) && !reason)
    return { ok: false, message: "Add a reason. The owner will see it." };

  const adminId = admin.user.id;
  let owner: { email: string } | undefined;
  let notice: ModerationNotice | undefined;
  let targetType: "publication" | "graph" | "user";
  const formTargetType = formData.get("targetType");

  if (op === "remove" || op === "restore" || (op === "dismiss" && formTargetType === "publication")) {
    targetType = "publication";
    const [row] = await db
      .select({ pub: publication, graphName: graph.name, email: user.email })
      .from(publication)
      .innerJoin(graph, eq(graph.id, publication.graphId))
      .innerJoin(user, eq(user.id, graph.userId))
      .where(eq(publication.id, targetId))
      .limit(1);
    if (!row) return { ok: false, message: "That page no longer exists." };
    owner = row;
    const page = {
      title: row.pub.title,
      url: publicationUrl(row.graphName, row.pub.rootUid, row.pub.title),
    };
    if (op === "remove") {
      await db
        .update(publication)
        .set({ removedAt: new Date(), removedReason: reason })
        .where(eq(publication.id, targetId));
      await resolveReports(eq(report.publicationId, targetId), "actioned", adminId);
      notice = { kind: "page_removed", ...page };
    } else if (op === "restore") {
      await db
        .update(publication)
        .set({ removedAt: null, removedReason: null })
        .where(eq(publication.id, targetId));
      notice = { kind: "page_restored", ...page };
    } else {
      await resolveReports(eq(report.publicationId, targetId), "dismissed", adminId);
    }
  } else if (op === "dismiss" && formTargetType === "profile") {
    targetType = "user";
    await resolveReports(eq(report.profileUserId, targetId), "dismissed", adminId);
  } else if (op === "suspend" || op === "unsuspend" || op === "dismiss") {
    targetType = "graph";
    const [row] = await db
      .select({ g: graph, email: user.email })
      .from(graph)
      .innerJoin(user, eq(user.id, graph.userId))
      .where(eq(graph.id, targetId))
      .limit(1);
    if (!row) return { ok: false, message: "That graph no longer exists." };
    owner = row;
    const g = { graphName: row.g.name, url: appUrl() + graphPath(row.g.name) };
    if (op === "suspend") {
      await db
        .update(graph)
        .set({ suspendedAt: new Date(), suspendedReason: reason, featured: false })
        .where(eq(graph.id, targetId));
      // Suspending the graph settles every open report on it, page reports included.
      await resolveReports(eq(report.graphId, targetId), "actioned", adminId);
      notice = { kind: "graph_suspended", ...g };
    } else if (op === "unsuspend") {
      await db
        .update(graph)
        .set({ suspendedAt: null, suspendedReason: null })
        .where(eq(graph.id, targetId));
      notice = { kind: "graph_restored", ...g };
    } else {
      await resolveReports(
        and(eq(report.graphId, targetId), isNull(report.publicationId)),
        "dismissed",
        adminId,
      );
    }
  } else {
    targetType = "user";
    const target = await db.query.user.findFirst({ where: eq(user.id, targetId) });
    if (!target) return { ok: false, message: "That user no longer exists." };
    if (op === "ban" && (target.id === adminId || isAdmin(target)))
      return { ok: false, message: "Admins can't be banned here." };
    owner = target;
    if (op === "ban") {
      await db.update(user).set({ banned: true, banReason: reason }).where(eq(user.id, targetId));
      // Sign them out everywhere; the admin plugin blocks new sign-ins while banned.
      await db.delete(sessionTable).where(eq(sessionTable.userId, targetId));
      const theirGraphs = db.select({ id: graph.id }).from(graph).where(eq(graph.userId, targetId));
      await resolveReports(
        or(inArray(report.graphId, theirGraphs), eq(report.profileUserId, targetId)),
        "actioned",
        adminId,
      );
      notice = { kind: "account_banned" };
    } else {
      await db
        .update(user)
        .set({ banned: false, banReason: null, banExpires: null })
        .where(eq(user.id, targetId));
      notice = { kind: "account_restored" };
    }
  }

  const emailed = notify && !!notice && !!owner;
  if (emailed) await notifyOwner(owner!.email, notice!, reason);
  await db.insert(moderationAction).values({ adminId, targetType, targetId, action: op, reason, emailed });

  revalidatePublic();
  return { ok: true, message: emailed ? "Done. The owner was emailed." : "Done." };
}

export async function adminRenameUsername(
  userId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = Username.safeParse(formData.get("username"));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const before = await db.query.profile.findFirst({ where: eq(profile.userId, userId) });
  const res = await renameUsername(userId, parsed.data);
  if (!res.ok) return res;
  if (before && before.username !== parsed.data) {
    await db.insert(moderationAction).values({
      adminId: admin.user.id,
      targetType: "user",
      targetId: userId,
      action: "rename_username",
      reason: `${before.username} → ${parsed.data}`,
    });
  }
  revalidatePath("/admin/users");
  revalidatePath("/dashboard");
  revalidatePath("/u/[username]", "page");
  return { ok: true, message: `Renamed to @${parsed.data}.` };
}

/**
 * For abusive usernames: drop the profile but keep the name reserved as an alias of its owner, so
 * /u/{name} 404s and nobody else can claim it. The user can claim a fresh name from the dashboard.
 */
export async function adminClearUsername(userId: string): Promise<ActionState> {
  const admin = await requireAdmin();
  const cleared = await db.transaction(async (tx) => {
    const p = await tx.query.profile.findFirst({ where: eq(profile.userId, userId) });
    if (!p) return null;
    await tx.insert(usernameAlias).values({ username: p.username, userId }).onConflictDoNothing();
    await tx.delete(profile).where(eq(profile.userId, userId));
    return p.username;
  });
  if (!cleared) return { ok: false, message: "That user has no username." };
  await resolveReports(eq(report.profileUserId, userId), "actioned", admin.user.id);
  await db.insert(moderationAction).values({
    adminId: admin.user.id,
    targetType: "user",
    targetId: userId,
    action: "clear_username",
    reason: cleared,
  });
  revalidatePath("/admin/users");
  revalidatePath("/dashboard");
  revalidatePath("/u/[username]", "page");
  return { ok: true, message: `Cleared @${cleared}.` };
}

/** For abusive profile descriptions: blanks the bio. The owner can write a new one. */
export async function adminClearBio(userId: string): Promise<ActionState> {
  const admin = await requireAdmin();
  const [cleared] = await db
    .update(profile)
    .set({ bio: "" })
    .where(eq(profile.userId, userId))
    .returning({ username: profile.username });
  if (!cleared) return { ok: false, message: "That user has no profile." };
  await resolveReports(eq(report.profileUserId, userId), "actioned", admin.user.id);
  await db.insert(moderationAction).values({
    adminId: admin.user.id,
    targetType: "user",
    targetId: userId,
    action: "clear_bio",
    reason: cleared.username,
  });
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/u/[username]", "page");
  return { ok: true, message: `Cleared the description on @${cleared.username}.` };
}

/** For abusive graph descriptions: blanks the front page description. */
export async function adminClearGraphDescription(graphId: string): Promise<ActionState> {
  const admin = await requireAdmin();
  const [cleared] = await db
    .update(graph)
    .set({ description: "" })
    .where(eq(graph.id, graphId))
    .returning({ name: graph.name });
  if (!cleared) return { ok: false, message: "That graph no longer exists." };
  await resolveReports(
    and(eq(report.graphId, graphId), isNull(report.publicationId)),
    "actioned",
    admin.user.id,
  );
  await db.insert(moderationAction).values({
    adminId: admin.user.id,
    targetType: "graph",
    targetId: graphId,
    action: "clear_description",
    reason: cleared.name,
  });
  revalidatePublic();
  return { ok: true, message: `Cleared the description on ${cleared.name}.` };
}

/**
 * Frees a former username: /u/{name} stops redirecting and anyone can claim it. Only for names
 * with no links worth keeping.
 */
export async function adminReleaseAlias(username: string): Promise<ActionState> {
  const admin = await requireAdmin();
  const [released] = await db
    .delete(usernameAlias)
    .where(eq(usernameAlias.username, username))
    .returning({ userId: usernameAlias.userId });
  if (!released) return { ok: false, message: "That name isn't reserved." };
  await db.insert(moderationAction).values({
    adminId: admin.user.id,
    targetType: "user",
    targetId: released.userId,
    action: "release_username",
    reason: username,
  });
  revalidatePath("/admin/users");
  revalidatePath("/u/[username]", "page");
  return { ok: true, message: `Released @${username}.` };
}
