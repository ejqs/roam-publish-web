import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { collection, collectionMember, graph, graphMember, invite, user } from "@/db/schema";
import { sendEmail } from "./email";
import * as templates from "./email-templates";
import { canReceiveInvite } from "./graph-access";
import { revokeKeys } from "./keys";

/**
 * Invitations and ownership transfers for graphs and collections. Nothing changes until the invitee
 * accepts, and every check is repeated at that point.
 */

export type TargetType = "graph" | "collection";
export type InviteKind = "member" | "transfer";
type Result = { ok: true; message: string } | { ok: false; message: string };

const INVITE_DAYS = 7;
const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
export const NOT_ELIGIBLE =
  "That person needs a roam.pub account with a verified email and a connected graph of their own.";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The thing being shared, with its owner and display name. */
async function target(tx: Tx | typeof db, type: TargetType, id: string) {
  if (type === "graph") {
    const g = await tx.query.graph.findFirst({ where: eq(graph.id, id) });
    return g ? { ownerId: g.userId, name: g.name, suspended: !!g.suspendedAt } : null;
  }
  const c = await tx.query.collection.findFirst({ where: eq(collection.id, id) });
  return c ? { ownerId: c.ownerId, name: c.name, suspended: !!c.suspendedAt } : null;
}

async function isMember(tx: Tx | typeof db, type: TargetType, targetId: string, userId: string) {
  const row =
    type === "graph"
      ? await tx.query.graphMember.findFirst({
          where: and(eq(graphMember.graphId, targetId), eq(graphMember.userId, userId)),
        })
      : await tx.query.collectionMember.findFirst({
          where: and(eq(collectionMember.collectionId, targetId), eq(collectionMember.userId, userId)),
        });
  return !!row;
}

const label = (type: TargetType, name: string) => (type === "graph" ? `the graph ${name}` : `the collection ${name}`);
const emailTarget = (type: TargetType, name: string) => ({
  type,
  typeLabel: type === "graph" ? "Graph" : "Collection",
  name,
});

/** Invite someone by email to join (kind "member") or take over (kind "transfer", members only). */
export async function createInvite(opts: {
  type: TargetType;
  targetId: string;
  kind: InviteKind;
  inviterId: string;
  email?: string;
  inviteeUserId?: string;
}): Promise<Result> {
  const t = await target(db, opts.type, opts.targetId);
  if (!t || t.ownerId !== opts.inviterId) return { ok: false, message: "Only the owner can do that." };
  if (t.suspended) return { ok: false, message: "This was suspended by a moderator." };

  const invitee = opts.inviteeUserId
    ? await db.query.user.findFirst({ where: eq(user.id, opts.inviteeUserId) })
    : await db.query.user.findFirst({ where: sql`lower(${user.email}) = ${opts.email!.trim().toLowerCase()}` });
  if (!invitee || !(await canReceiveInvite(invitee.id))) return { ok: false, message: NOT_ELIGIBLE };
  if (invitee.id === opts.inviterId) return { ok: false, message: "That's you." };

  const member = await isMember(db, opts.type, opts.targetId, invitee.id);
  if (opts.kind === "member" && member) return { ok: false, message: "They're already a member." };
  if (opts.kind === "transfer" && !member)
    return { ok: false, message: "You can only transfer ownership to a member." };

  const inserted = await db
    .insert(invite)
    .values({
      targetType: opts.type,
      targetId: opts.targetId,
      kind: opts.kind,
      inviteeUserId: invitee.id,
      email: invitee.email,
      invitedBy: opts.inviterId,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
    })
    .onConflictDoNothing()
    .returning({ id: invite.id });
  if (inserted.length === 0)
    return {
      ok: false,
      message: opts.kind === "transfer" ? "A transfer is already waiting for an answer." : "They already have an invite.",
    };

  void sendEmail({
    to: invitee.email,
    ...templates.email(opts.kind === "transfer" ? templates.transferOffer : templates.invite, {
      ...emailTarget(opts.type, t.name),
      url: `${appUrl()}/dashboard/invites`,
      days: String(INVITE_DAYS),
    }),
  });
  return {
    ok: true,
    message: opts.kind === "transfer" ? "Transfer sent. It takes effect when they accept." : "Invite sent.",
  };
}

/** Pending, unexpired invites for this person, with what they're for. */
export async function pendingInvitesFor(userId: string) {
  const rows = await db
    .select()
    .from(invite)
    .where(and(eq(invite.inviteeUserId, userId), eq(invite.status, "pending"), gt(invite.expiresAt, new Date())))
    .orderBy(invite.createdAt);
  const out = [];
  for (const i of rows) {
    const t = await target(db, i.targetType, i.targetId);
    const inviter = i.invitedBy
      ? await db.query.user.findFirst({ where: eq(user.id, i.invitedBy), columns: { name: true, email: true } })
      : null;
    if (t) out.push({ ...i, targetName: t.name, inviter });
  }
  return out;
}

/** Pending invites the owner sent for one graph or collection. */
export function pendingInvitesOn(type: TargetType, targetId: string) {
  return db
    .select({ id: invite.id, email: invite.email, kind: invite.kind, expiresAt: invite.expiresAt })
    .from(invite)
    .where(
      and(
        eq(invite.targetType, type),
        eq(invite.targetId, targetId),
        eq(invite.status, "pending"),
        gt(invite.expiresAt, new Date()),
      ),
    )
    .orderBy(invite.createdAt);
}

export async function respondToInvite(inviteId: string, userId: string, accept: boolean): Promise<Result> {
  const res = await db.transaction(async (tx): Promise<Result & { notify?: () => void }> => {
    const [i] = await tx
      .select()
      .from(invite)
      .where(and(eq(invite.id, inviteId), eq(invite.inviteeUserId, userId)))
      .for("update");
    if (!i || i.status !== "pending") return { ok: false, message: "That invite is no longer open." };
    if (i.expiresAt < new Date()) return { ok: false, message: "That invite expired. Ask for a new one." };

    if (!accept) {
      await tx.update(invite).set({ status: "declined", respondedAt: new Date() }).where(eq(invite.id, i.id));
      return { ok: true, message: "Declined." };
    }
    const t = await target(tx, i.targetType, i.targetId);
    if (!t || t.ownerId !== i.invitedBy || t.suspended) {
      await tx.update(invite).set({ status: "cancelled", respondedAt: new Date() }).where(eq(invite.id, i.id));
      return { ok: false, message: "That invite is no longer valid." };
    }
    if (!(await canReceiveInvite(userId))) return { ok: false, message: NOT_ELIGIBLE };

    const member = await isMember(tx, i.targetType, i.targetId, userId);
    if (i.kind === "member") {
      if (!member) {
        if (i.targetType === "graph")
          await tx.insert(graphMember).values({ graphId: i.targetId, userId, invitedBy: i.invitedBy });
        else
          await tx.insert(collectionMember).values({ collectionId: i.targetId, userId, invitedBy: i.invitedBy });
      }
    } else {
      if (!member) return { ok: false, message: "Only members can take over ownership." };
      const oldOwner = t.ownerId;
      if (i.targetType === "graph") {
        await tx.delete(graphMember).where(and(eq(graphMember.graphId, i.targetId), eq(graphMember.userId, userId)));
        await tx.update(graph).set({ userId }).where(eq(graph.id, i.targetId));
        await tx.insert(graphMember).values({ graphId: i.targetId, userId: oldOwner, invitedBy: userId }).onConflictDoNothing();
      } else {
        await tx
          .delete(collectionMember)
          .where(and(eq(collectionMember.collectionId, i.targetId), eq(collectionMember.userId, userId)));
        await tx.update(collection).set({ ownerId: userId }).where(eq(collection.id, i.targetId));
        await tx
          .insert(collectionMember)
          .values({ collectionId: i.targetId, userId: oldOwner, invitedBy: userId })
          .onConflictDoNothing();
      }
      // Invites the old owner sent are theirs to stand behind; the new owner sends their own.
      await tx
        .update(invite)
        .set({ status: "cancelled", respondedAt: new Date() })
        .where(
          and(
            eq(invite.targetType, i.targetType),
            eq(invite.targetId, i.targetId),
            eq(invite.status, "pending"),
            sql`${invite.id} <> ${i.id}`,
          ),
        );
    }
    await tx.update(invite).set({ status: "accepted", respondedAt: new Date() }).where(eq(invite.id, i.id));

    if (i.kind === "transfer") {
      const [oldOwner, newOwner] = await Promise.all([
        tx.query.user.findFirst({ where: eq(user.id, t.ownerId), columns: { email: true } }),
        tx.query.user.findFirst({ where: eq(user.id, userId), columns: { email: true } }),
      ]);
      const what = label(i.targetType, t.name);
      return {
        ok: true,
        message: `You now own ${what}.`,
        notify: () => {
          if (oldOwner)
            void sendEmail({
              to: oldOwner.email,
              ...templates.email(templates.transferDoneOldOwner, {
                ...emailTarget(i.targetType, t.name),
                newOwner: newOwner?.email ?? "The new owner",
              }),
            });
          if (newOwner)
            void sendEmail({
              to: newOwner.email,
              ...templates.email(templates.transferDoneNewOwner, {
                ...emailTarget(i.targetType, t.name),
                url: `${appUrl()}/dashboard`,
              }),
            });
        },
      };
    }
    return { ok: true, message: `You joined ${label(i.targetType, t.name)}.` };
  });
  res.notify?.();
  return { ok: res.ok, message: res.message } as Result;
}

export async function cancelInvite(inviteId: string, ownerId: string): Promise<Result> {
  const i = await db.query.invite.findFirst({ where: eq(invite.id, inviteId) });
  if (!i || i.status !== "pending") return { ok: false, message: "That invite is no longer open." };
  const t = await target(db, i.targetType, i.targetId);
  if (!t || t.ownerId !== ownerId) return { ok: false, message: "Only the owner can do that." };
  await db.update(invite).set({ status: "cancelled", respondedAt: new Date() }).where(eq(invite.id, i.id));
  return { ok: true, message: "Invite cancelled." };
}

/**
 * Removes a member (by the owner) or leaves (by the member). Removing someone from a graph also
 * revokes their key for it; their pages stay, and the owner manages them from then on.
 */
export async function removeMember(type: TargetType, targetId: string, memberId: string, actorId: string): Promise<Result> {
  const t = await target(db, type, targetId);
  if (!t) return { ok: false, message: "Not found." };
  if (actorId !== t.ownerId && actorId !== memberId) return { ok: false, message: "Only the owner can do that." };
  if (memberId === t.ownerId) return { ok: false, message: "Transfer ownership before leaving." };
  if (type === "graph") {
    await db.delete(graphMember).where(and(eq(graphMember.graphId, targetId), eq(graphMember.userId, memberId)));
    await revokeKeys(memberId, targetId);
  } else {
    await db
      .delete(collectionMember)
      .where(and(eq(collectionMember.collectionId, targetId), eq(collectionMember.userId, memberId)));
  }
  await db
    .update(invite)
    .set({ status: "cancelled", respondedAt: new Date() })
    .where(
      and(
        eq(invite.targetType, type),
        eq(invite.targetId, targetId),
        eq(invite.inviteeUserId, memberId),
        eq(invite.status, "pending"),
      ),
    );
  return { ok: true, message: actorId === memberId ? "You left." : "Member removed." };
}

/**
 * How one person shows in a members list. Emails are for the owner, who invites by them, and for
 * yourself; other members see the name each person signed up with.
 */
export function memberLabel(person: { userId: string; email: string; name: string }, viewer: { id: string; isOwner: boolean }) {
  return viewer.isOwner || person.userId === viewer.id ? person.email : person.name;
}

/** Members of a graph or collection, with their emails, oldest first. */
export async function membersOf(type: TargetType, targetId: string) {
  if (type === "graph")
    return db
      .select({ userId: user.id, email: user.email, name: user.name, createdAt: graphMember.createdAt })
      .from(graphMember)
      .innerJoin(user, eq(user.id, graphMember.userId))
      .where(eq(graphMember.graphId, targetId))
      .orderBy(graphMember.createdAt);
  return db
    .select({ userId: user.id, email: user.email, name: user.name, createdAt: collectionMember.createdAt })
    .from(collectionMember)
    .innerJoin(user, eq(user.id, collectionMember.userId))
    .where(eq(collectionMember.collectionId, targetId))
    .orderBy(collectionMember.createdAt);
}
