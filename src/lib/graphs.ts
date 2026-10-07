import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { graph, user } from "@/db/schema";

/**
 * Per-request lookup shared by the front page, publication pages, and their metadata.
 * `takenDown` is true when a moderator suspended the graph or banned its owner.
 */
export const loadGraph = cache(async (name: string) => {
  const [row] = await db
    .select({ g: graph, banned: user.banned })
    .from(graph)
    .innerJoin(user, eq(user.id, graph.userId))
    .where(eq(graph.name, name))
    .limit(1);
  if (!row) return undefined;
  return { ...row.g, takenDown: !!row.g.suspendedAt || !!row.banned };
});

export { graphPath } from "./publications";
