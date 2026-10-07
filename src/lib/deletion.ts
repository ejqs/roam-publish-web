import "server-only";
import { createHash } from "node:crypto";
import { and, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  apikey,
  blockedIdentity,
  type BlockedKind,
  collection,
  collectionEntry,
  cPath,
  graph,
  graphMember,
  invite,
  moderationAction,
  profile,
  publication,
  report,
  user,
  usernameAlias,
} from "@/db/schema";
import { afterReturnToGraph, dropOrphanLockKeys } from "./encryption";
import { keyedHash } from "./keyed-hash";
import { keyGraphId } from "./key-metadata";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = typeof db | Tx;

/** Lowercase, without a +tag, so `Name+x@host` and `name@host` are the same address here. */
export function normalizeEmail(email: string) {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 0) return e;
  return e.slice(0, at).replace(/\+.*$/, "") + e.slice(at);
}

/** Blocked emails are kept only as this hash, never in the clear. */
export const emailHash = (email: string) => createHash("sha256").update(normalizeEmail(email)).digest("hex");

/**
 * What a deleted account's reports keep in place of its email: enough to tell that one person filed
 * several reports, without the address. Never contains an @, which is how the admin page tells them apart.
 */
export const reporterEmailHash = (email: string) => keyedHash("reporter-email", normalizeEmail(email));

/** The stored form of a blocklist value: graph names and usernames compare case-insensitively. */
export function blockedValue(kind: BlockedKind, value: string) {
  return kind === "email" ? emailHash(value) : value.trim().toLowerCase();
}

export async function isBlocked(kind: BlockedKind, value: string, tx: Db = db) {
  const [row] = await tx
    .select({ kind: blockedIdentity.kind })
    .from(blockedIdentity)
    .where(and(eq(blockedIdentity.kind, kind), eq(blockedIdentity.value, blockedValue(kind, value))))
    .limit(1);
  return !!row;
}

/** Deletes every API key issued for this graph, whoever holds it. Keys only name their graph in metadata. */
async function deleteGraphKeys(tx: Tx, graphId: string, holderIds: string[]) {
  if (!holderIds.length) return;
  const keys = await tx
    .select({ id: apikey.id, metadata: apikey.metadata })
    .from(apikey)
    .where(inArray(apikey.referenceId, holderIds));
  const ids = keys.filter((k) => keyGraphId(k.metadata) === graphId).map((k) => k.id);
  if (ids.length) await tx.delete(apikey).where(inArray(apikey.id, ids));
}

/**
 * Deletes a graph and everything published from it. Pages, members, default collections, reports and
 * the pages' collection entries cascade; entry paths stay reserved in c_path so old links never point
 * at something new. Callers check ownership and moderation first.
 */
export async function purgeGraph(tx: Tx, g: { id: string; userId: string }) {
  const members = await tx
    .select({ userId: graphMember.userId })
    .from(graphMember)
    .where(eq(graphMember.graphId, g.id));
  await deleteGraphKeys(tx, g.id, [g.userId, ...members.map((m) => m.userId)]);
  await tx.delete(invite).where(and(eq(invite.targetType, "graph"), eq(invite.targetId, g.id)));
  await tx.delete(graph).where(eq(graph.id, g.id));
  await dropOrphanLockKeys(tx);
}

/**
 * Deletes a collection and its entries; the pages stay published in their graphs. With keepSlug the
 * slug stays reserved, so a suspended collection can't come back under the same name.
 */
export async function purgeCollection(tx: Tx, c: { id: string; slug: string }, opts: { keepSlug: boolean }) {
  // Pages that were only in this collection go back to their graphs, unlisted.
  const back = await tx.execute<{ id: string }>(sql`
    update publication set in_graph = true, visibility = 'unlisted'
    where in_graph = false
      and id in (select publication_id from collection_entry where collection_id = ${c.id})
      and not exists (
        select 1 from collection_entry e where e.publication_id = publication.id and e.collection_id <> ${c.id}
      )
    returning id
  `);
  await tx.delete(collectionEntry).where(eq(collectionEntry.collectionId, c.id));
  await tx.delete(invite).where(and(eq(invite.targetType, "collection"), eq(invite.targetId, c.id)));
  await tx.delete(collection).where(eq(collection.id, c.id));
  // Entry uids stay reserved either way so old links never point at something new.
  if (!opts.keepSlug) await tx.delete(cPath).where(eq(cPath.path, c.slug));
  await dropOrphanLockKeys(tx);
  await afterReturnToGraph(tx, back.rows.map((r) => r.id));
}

/** True when a moderator suspended the graph or removed any page in it. Such graphs can't be deleted alone. */
export async function graphUnderModeration(tx: Db, g: { id: string; suspendedAt: Date | null }) {
  if (g.suspendedAt) return true;
  const [removed] = await tx
    .select({ id: publication.id })
    .from(publication)
    .where(and(eq(publication.graphId, g.id), isNotNull(publication.removedAt)))
    .limit(1);
  return !!removed;
}

/** What a moderator has done to this person's things, for deciding what an account deletion blocklists. */
export async function sanctionsOf(tx: Db, userId: string) {
  const [u] = await tx.select({ banned: user.banned }).from(user).where(eq(user.id, userId)).limit(1);
  const graphs = await tx
    .select({ id: graph.id, name: graph.name, suspendedAt: graph.suspendedAt })
    .from(graph)
    .where(eq(graph.userId, userId));
  const sanctionedGraphs: string[] = [];
  for (const g of graphs) if (await graphUnderModeration(tx, g)) sanctionedGraphs.push(g.name);
  const suspendedCollections = await tx
    .select({ slug: collection.slug })
    .from(collection)
    .where(and(eq(collection.ownerId, userId), isNotNull(collection.suspendedAt)));
  // Pages they published as a member of someone else's graph.
  const [removedElsewhere] = await tx
    .select({ id: publication.id })
    .from(publication)
    .innerJoin(graph, eq(graph.id, publication.graphId))
    .where(and(eq(publication.publishedBy, userId), ne(graph.userId, userId), isNotNull(publication.removedAt)))
    .limit(1);
  const reasons = [
    ...(u?.banned ? ["account banned"] : []),
    ...sanctionedGraphs.map((n) => `graph ${n} suspended or has removed pages`),
    ...suspendedCollections.map((c) => `collection ${c.slug} suspended`),
    ...(removedElsewhere ? ["removed pages in other graphs"] : []),
  ];
  return { sanctioned: reasons.length > 0, reasons, graphNames: graphs.map((g) => g.name) };
}

/**
 * Runs before better-auth deletes the user row (sessions, profile, aliases, memberships, votes, views and
 * invites to them cascade from it). Deletes what they own and published. When a moderator had acted on
 * any of it, their email, graph names and usernames go on the blocklist so a fresh account can't pick
 * them back up: the graph name is the strong anchor, since connecting a graph needs Roam's own token.
 */
export async function deleteAccountData(u: { id: string; email: string }) {
  await db.transaction(async (tx) => {
    const s = await sanctionsOf(tx, u.id);
    const [p] = await tx.select({ username: profile.username }).from(profile).where(eq(profile.userId, u.id));
    const aliases = await tx
      .select({ username: usernameAlias.username })
      .from(usernameAlias)
      .where(eq(usernameAlias.userId, u.id));
    const usernames = [...(p ? [p.username] : []), ...aliases.map((a) => a.username)];

    const blocked: { kind: BlockedKind; value: string }[] = s.sanctioned
      ? [
          { kind: "email", value: blockedValue("email", u.email) },
          // Every graph they own, not only the sanctioned ones, so the ban can't move to a sibling graph.
          ...s.graphNames.map((n) => ({ kind: "graph" as const, value: blockedValue("graph", n) })),
          ...usernames.map((n) => ({ kind: "username" as const, value: blockedValue("username", n) })),
        ]
      : [];
    const [logged] = await tx
      .insert(moderationAction)
      .values({
        adminId: null,
        targetType: "user",
        targetId: u.id,
        action: "delete_account",
        reason: s.sanctioned
          ? `Deleted by its owner. Blocklisted (${s.reasons.join("; ")}): email, ` +
            [...s.graphNames.map((n) => `graph ${n}`), ...usernames.map((n) => `@${n}`)].join(", ")
          : "Deleted by its owner.",
      })
      .returning({ id: moderationAction.id });
    if (blocked.length)
      await tx
        .insert(blockedIdentity)
        .values(blocked.map((b) => ({ ...b, reason: s.reasons.join("; "), moderationActionId: logged.id })))
        .onConflictDoNothing();

    const collections = await tx
      .select({ id: collection.id, slug: collection.slug, suspendedAt: collection.suspendedAt })
      .from(collection)
      .where(eq(collection.ownerId, u.id));
    for (const c of collections) await purgeCollection(tx, c, { keepSlug: !!c.suspendedAt });

    const graphs = await tx.select({ id: graph.id, userId: graph.userId }).from(graph).where(eq(graph.userId, u.id));
    for (const g of graphs) await purgeGraph(tx, g);

    // What they published into other people's graphs goes too, except removed pages: those stay locked
    // (publishedBy becomes null) so the graph's owner can't republish them.
    await tx.delete(publication).where(and(eq(publication.publishedBy, u.id), isNull(publication.removedAt)));
    await dropOrphanLockKeys(tx);
    await tx.delete(apikey).where(eq(apikey.referenceId, u.id));
    // Invites to them cascade; ones they sent would otherwise outlive them.
    await tx.delete(invite).where(eq(invite.invitedBy, u.id));
    // Reports they filed stay for moderation, with their email hashed. Signed-out reports count when
    // they gave the same address.
    await tx
      .update(report)
      .set({ reporterEmail: reporterEmailHash(u.email) })
      .where(
        and(
          isNotNull(report.reporterEmail),
          or(eq(report.reporterUserId, u.id), sql`lower(${report.reporterEmail}) = ${u.email.trim().toLowerCase()}`),
        ),
      );
  });
}
