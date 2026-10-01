"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { graph, profile, publication, usernameAlias, type Visibility } from "@/db/schema";
import { auth } from "@/lib/auth";
import { Username, usernameTakenByOther } from "@/lib/usernames";

async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

const myGraphIds = (userId: string) =>
  db.select({ id: graph.id }).from(graph).where(eq(graph.userId, userId));

export async function unpublish(publicationId: string) {
  const session = await getSession();
  if (!session) return;
  await db
    .delete(publication)
    .where(
      and(
        eq(publication.id, publicationId),
        inArray(publication.graphId, myGraphIds(session.user.id)),
        // Removed pages stay locked so a republish can't undo the takedown.
        isNull(publication.removedAt),
      ),
    );
  revalidatePath("/dashboard");
}

export async function setVisibility(publicationId: string, visibility: Visibility) {
  const session = await getSession();
  if (!session) return;
  await db
    .update(publication)
    .set({ visibility: visibility === "public" ? "public" : "unlisted" })
    .where(
      and(
        eq(publication.id, publicationId),
        inArray(publication.graphId, myGraphIds(session.user.id)),
        isNull(publication.removedAt),
      ),
    );
  revalidatePath("/dashboard");
  revalidatePath("/[graph]", "page");
  revalidatePath("/");
}

export type FormState = { ok: boolean; message: string } | null;

export async function claimUsername(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Your session expired. Please log in again." };
  const parsed = Username.safeParse(formData.get("username"));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const username = parsed.data;
  const userId = session.user.id;

  // Only admins can rename (see /admin), so this is a one-time claim.
  const error = await db.transaction(async (tx) => {
    if (await tx.query.profile.findFirst({ where: eq(profile.userId, userId) }))
      return "You already have a username.";
    // Former usernames stay reserved so their redirects keep working.
    if (await usernameTakenByOther(tx, username, userId)) return "That username is taken.";
    // Without a profile, one's own aliases can only be a name an admin cleared; keep those blocked.
    if (await tx.query.usernameAlias.findFirst({ where: eq(usernameAlias.username, username) }))
      return "That username isn't available.";
    const inserted = await tx
      .insert(profile)
      .values({ userId, username })
      .onConflictDoNothing()
      .returning({ username: profile.username });
    return inserted.length ? null : "That username is taken.";
  });
  if (error) return { ok: false, message: error };
  revalidatePath("/dashboard");
  return { ok: true, message: `Claimed @${username}.` };
}

export async function setProfilePublic(isPublic: boolean) {
  const session = await getSession();
  if (!session) return;
  await db.update(profile).set({ isPublic }).where(eq(profile.userId, session.user.id));
  revalidatePath("/dashboard");
  revalidatePath("/u/[username]", "page");
}

const GraphSettings = z.object({
  frontPage: z.boolean(),
  indexable: z.boolean(),
  featured: z.boolean(),
});
export type GraphSettings = z.infer<typeof GraphSettings>;

export async function updateGraphSettings(graphId: string, input: GraphSettings): Promise<FormState> {
  const session = await getSession();
  if (!session) return { ok: false, message: "Your session expired. Please log in again." };
  const parsed = GraphSettings.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid settings." };
  const s = parsed.data;

  const updated = await db
    .update(graph)
    // Featuring links to the front page, so it can't outlive it.
    .set({ ...s, featured: s.featured && s.frontPage })
    .where(and(eq(graph.id, graphId), eq(graph.userId, session.user.id)))
    .returning({ name: graph.name });
  if (updated.length === 0) return { ok: false, message: "Graph not found." };

  revalidatePath("/dashboard", "layout");
  revalidatePath("/[graph]", "layout");
  revalidatePath("/u/[username]", "page");
  revalidatePath("/");
  return { ok: true, message: "Settings saved." };
}
