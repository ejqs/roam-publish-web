import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { graph, profile, user } from "@/db/schema";

/**
 * Usernames and public profiles are for people who proved they own a Roam graph. A graph a
 * moderator suspended doesn't count, so losing the last one also hides the profile.
 */
export const hasVerifiedGraph = cache(async (userId: string) => {
  const [row] = await db
    .select({ id: graph.id })
    .from(graph)
    .where(and(eq(graph.userId, userId), isNull(graph.suspendedAt)))
    .limit(1);
  return !!row;
});

/** The owner's profile when /u/{username} would show it, for linking to it; otherwise null. */
export const publicProfile = cache(async (userId: string) => {
  const [row] = await db
    .select({ username: profile.username, isPublic: profile.isPublic, banned: user.banned })
    .from(profile)
    .innerJoin(user, eq(user.id, profile.userId))
    .where(eq(profile.userId, userId))
    .limit(1);
  if (!row?.isPublic || row.banned) return null;
  if (!(await hasVerifiedGraph(userId))) return null;
  return { username: row.username };
});
