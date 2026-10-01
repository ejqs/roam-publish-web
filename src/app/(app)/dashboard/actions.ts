"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/db";
import { graph, publication } from "@/db/schema";
import { auth } from "@/lib/auth";

export async function unpublish(publicationId: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return;
  const myGraphs = db.select({ id: graph.id }).from(graph).where(eq(graph.userId, session.user.id));
  await db
    .delete(publication)
    .where(and(eq(publication.id, publicationId), inArray(publication.graphId, myGraphs)));
  revalidatePath("/dashboard");
}
