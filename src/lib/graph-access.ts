import { and, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { graph, graphMember, publication, user } from "@/db/schema";
import { hasVerifiedGraph } from "./profiles";

export type GraphRole = "owner" | "member";

/** The owner is graph.userId; members are rows in graph_member. */
export async function graphRole(userId: string, graphId: string): Promise<GraphRole | null> {
  const g = await db.query.graph.findFirst({ where: eq(graph.id, graphId), columns: { userId: true } });
  if (!g) return null;
  if (g.userId === userId) return "owner";
  const m = await db.query.graphMember.findFirst({
    where: and(eq(graphMember.graphId, graphId), eq(graphMember.userId, userId)),
  });
  return m ? "member" : null;
}

/** Graphs this person owns or belongs to, with their role, owned first then by name. */
export const graphsOf = cache(async (userId: string) => {
  const [owned, joined] = await Promise.all([
    db.select().from(graph).where(eq(graph.userId, userId)).orderBy(graph.name),
    db
      .select({ g: graph })
      .from(graphMember)
      .innerJoin(graph, eq(graph.id, graphMember.graphId))
      .where(eq(graphMember.userId, userId))
      .orderBy(graph.name),
  ]);
  return [
    ...owned.map((g) => ({ ...g, role: "owner" as GraphRole })),
    ...joined.map(({ g }) => ({ ...g, role: "member" as GraphRole })),
  ];
});

/**
 * Invites and transfers only go to people who could have set up a graph themselves: a verified
 * email, not banned, and a verified graph of their own that isn't suspended.
 */
export async function canReceiveInvite(userId: string) {
  const u = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { emailVerified: true, banned: true },
  });
  if (!u?.emailVerified || u.banned) return false;
  return hasVerifiedGraph(userId);
}

const ownedGraphIds = (userId: string) =>
  db.select({ id: graph.id }).from(graph).where(eq(graph.userId, userId));
const memberGraphIds = (userId: string) =>
  db.select({ id: graphMember.graphId }).from(graphMember).where(eq(graphMember.userId, userId));

/**
 * Publications this person may change: every page in graphs they own, and the pages they published
 * themselves in graphs they belong to. Removed pages stay locked for everyone.
 */
export function manageablePublications(userId: string): SQL {
  return and(
    or(
      inArray(publication.graphId, ownedGraphIds(userId)),
      and(inArray(publication.graphId, memberGraphIds(userId)), eq(publication.publishedBy, userId)),
    ),
    isNull(publication.removedAt),
  ) as SQL;
}

/** `manageablePublications` for one already-loaded page, given the viewer's role in its graph. */
export function canManage(
  role: GraphRole | null,
  userId: string,
  pub: { publishedBy: string | null; removedAt: Date | null },
) {
  if (pub.removedAt || !role) return false;
  return role === "owner" || pub.publishedBy === userId;
}
