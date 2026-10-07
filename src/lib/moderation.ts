import "server-only";
import { and, eq, isNull, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { graph, publication, user } from "@/db/schema";

/** Publications a moderator hasn't taken down. */
export const livePublication = isNull(publication.removedAt);

/** Graphs that aren't suspended and whose owner isn't banned. Needs `user` joined on graph.userId. */
export const liveGraph = and(
  isNull(graph.suspendedAt),
  or(isNull(user.banned), eq(user.banned, false)),
) as SQL;

/** Graph ids that are live, for use in `inArray(…, liveGraphIds())`. */
export const liveGraphIds = () =>
  db.select({ id: graph.id }).from(graph).innerJoin(user, eq(user.id, graph.userId)).where(liveGraph);
