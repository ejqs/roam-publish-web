"use server";

import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/db";
import { publication, shortlink } from "@/db/schema";
import { auth } from "@/lib/auth";
import { manageablePublications } from "@/lib/graph-access";
import { withAction } from "@/lib/telemetry";

/**
 * Hides a "Changelog block missing" issue. The page's change log stays off until the page is
 * republished from Roam, which adds the blocks back.
 */
export async function dismissChangeLogIssue(shortlinkId: string) {
  return withAction("dashboard.changelog.dismissChangeLogIssue", async () => {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return;
    const mine = db
      .select({ id: shortlink.id })
      .from(shortlink)
      .innerJoin(
        publication,
        and(eq(publication.graphId, shortlink.graphId), eq(publication.rootUid, shortlink.rootUid)),
      )
      .where(and(eq(shortlink.id, shortlinkId), manageablePublications(session.user.id)));
    await db
      .update(shortlink)
      .set({ anchorMissingDismissedAt: new Date() })
      .where(inArray(shortlink.id, mine));
    revalidatePath("/dashboard");
  });
}
