"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { ACCESS, graph, graphDefaultCollection, moderationAction, profile, publication, usernameAlias, VIEWS_MODE } from "@/db/schema";
import { auth } from "@/lib/auth";
import { logChange, logChanges } from "@/lib/changelog";
import { DISCOVER_TAG } from "@/lib/discover";
import { collectionRole } from "@/lib/collections";
import { Description } from "@/lib/descriptions";
import { clearGatedGraphDiscover } from "@/lib/discover-rules";
import { pagesNeedingContainerPassword } from "@/lib/container-pages";
import { graphUnderModeration, purgeGraph } from "@/lib/deletion";
import { dropLock, dropOrphanLockKeys, KeysError, setLockPassword } from "@/lib/encryption";
import { hashPassword, Password } from "@/lib/gates";
import { manageablePublications } from "@/lib/graph-access";
import { hasVerifiedGraph } from "@/lib/profiles";
import { rateLimit } from "@/lib/rate-limit";
import { Username, usernameTakenByOther } from "@/lib/usernames";
import { withAction } from "@/lib/telemetry";

async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function unpublish(publicationId: string) {
  return withAction("dashboard.unpublish", async () => {
    const session = await getSession();
    if (!session) return;
    const deleted = await db
      .delete(publication)
      // Owners unpublish anything in their graphs, members what they published. Removed pages stay
      // locked so a republish can't undo the takedown.
      .where(and(eq(publication.id, publicationId), manageablePublications(session.user.id)))
      .returning({ graphId: publication.graphId, rootUid: publication.rootUid });
    await dropOrphanLockKeys(db);
    logChanges(deleted.map((p) => ({ ...p, category: "publishing" as const, text: "Unpublished on the website" })));
    revalidatePath("/dashboard", "layout");
    revalidatePath("/c/[id]", "layout");
    updateTag(DISCOVER_TAG);
  });
}


/**
 * Who can find a page: link only, the graph's front page, or also Discover. Unlisting leaves the
 * Discover flag alone (it has no effect while unlisted), so the extension's "make public" can still
 * restore what was seeded at publish time.
 */
export type Access = "unlisted" | "public" | "discover";

export type FormState = { ok: boolean; message: string; needCurrentPassword?: boolean } | null;

const ACCESS_LOG: Record<Access, string> = {
  unlisted: "Made unlisted",
  public: "Made public",
  discover: "Made public and listed on Discover",
};

export async function setAccess(publicationId: string, access: Access): Promise<FormState> {
  return withAction("dashboard.setAccess", async () => {
    const session = await getSession();
    if (!session) return { ok: false, message: "Your session expired. Please log in again." };
    if (access === "discover") {
      // Password-protected and members-only pages never go on Discover.
      const [row] = await db
        .select({ pub: publication, g: graph })
        .from(publication)
        .innerJoin(graph, eq(graph.id, publication.graphId))
        .where(eq(publication.id, publicationId))
        .limit(1);
      const effective = row && (row.pub.access === "inherit" ? row.g.defaultAccess : row.pub.access);
      if (!row || effective !== "open" || row.g.indexAccess !== "open" || !row.pub.inGraph)
        return { ok: false, message: "Only open pages in an open graph can be listed on Discover." };
    }
    const set =
      access === "discover"
        ? { visibility: "public" as const, discoverable: true }
        : access === "public"
          ? { visibility: "public" as const, discoverable: false }
          : { visibility: "unlisted" as const };
    const before = await db.query.publication.findFirst({ where: eq(publication.id, publicationId) });
    const [changed] = await db
      .update(publication)
      .set(set)
      .where(and(eq(publication.id, publicationId), manageablePublications(session.user.id)))
      .returning({ graphId: publication.graphId, rootUid: publication.rootUid });
    if (!changed) return { ok: false, message: "You can't change this page." };
    // Only real changes are logged; unlisting leaves the Discover flag alone.
    const same =
      before?.visibility === set.visibility && (set.visibility === "unlisted" || before.discoverable === set.discoverable);
    if (changed && !same) logChange(changed, "listing", ACCESS_LOG[access]);
    revalidatePath("/dashboard", "layout");
    revalidatePath("/[graph]", "page");
    revalidatePath("/");
    updateTag(DISCOVER_TAG);
    return { ok: true, message: "Saved." };
  });
}

const NEEDS_GRAPH = "Connect a Roam graph first.";

export async function claimUsername(_prev: FormState, formData: FormData): Promise<FormState> {
  return withAction("dashboard.claimUsername", async () => {
    const session = await getSession();
    if (!session) return { ok: false, message: "Your session expired. Please log in again." };
    if (!(await hasVerifiedGraph(session.user.id))) return { ok: false, message: NEEDS_GRAPH };
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
  });
}

export async function setProfilePublic(isPublic: boolean) {
  return withAction("dashboard.setProfilePublic", async () => {
    const session = await getSession();
    if (!session) return;
    // Going private is always allowed; going public needs a graph behind the profile.
    if (isPublic && !(await hasVerifiedGraph(session.user.id))) return;
    await db.update(profile).set({ isPublic }).where(eq(profile.userId, session.user.id));
    revalidatePath("/dashboard");
    revalidatePath("/u/[username]", "page");
  });
}

export async function updateBio(_prev: FormState, formData: FormData): Promise<FormState> {
  return withAction("dashboard.updateBio", async () => {
    const session = await getSession();
    if (!session) return { ok: false, message: "Your session expired. Please log in again." };
    const userId = session.user.id;
    if (!(await hasVerifiedGraph(userId))) return { ok: false, message: NEEDS_GRAPH };
    const parsed = Description.safeParse(formData.get("bio") ?? "");
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    if (!rateLimit(`bio:user:${userId}`, 20, 15 * 60 * 1000))
      return { ok: false, message: "Too many changes. Try again in a few minutes." };

    const updated = await db
      .update(profile)
      .set({ bio: parsed.data })
      .where(eq(profile.userId, userId))
      .returning({ userId: profile.userId });
    if (updated.length === 0) return { ok: false, message: "Claim a username first." };
    revalidatePath("/dashboard");
    revalidatePath("/u/[username]", "page");
    return { ok: true, message: "Description saved." };
  });
}

const GraphSettings = z.object({
  frontPage: z.boolean(),
  indexable: z.boolean(),
  featured: z.boolean(),
  showOwner: z.boolean(),
  hideUnlistedBreadcrumbs: z.boolean(),
  rss: z.boolean(),
  description: Description,
});
export type GraphSettings = z.input<typeof GraphSettings>;

/** Saves the settings given; the Settings and Sharing tabs each send their own. */
export async function updateGraphSettings(graphId: string, input: Partial<GraphSettings>): Promise<FormState> {
  return withAction("dashboard.updateGraphSettings", async () => {
    const session = await getSession();
    if (!session) return { ok: false, message: "Your session expired. Please log in again." };
    const parsed = GraphSettings.partial().safeParse(input);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { ok: false, message: issue.path[0] === "description" ? issue.message : "Invalid settings." };
    }
    const current = await db.query.graph.findFirst({
      where: and(eq(graph.id, graphId), eq(graph.userId, session.user.id)),
      columns: { frontPage: true, featured: true, rss: true },
    });
    if (!current) return { ok: false, message: "Graph not found." };
    const s = { ...current, ...parsed.data };

    const updated = await db
      .update(graph)
      // Featuring and the feed both list the front page, so they can't outlive it.
      .set({ ...s, featured: s.featured && s.frontPage, rss: s.rss && s.frontPage })
      .where(and(eq(graph.id, graphId), eq(graph.userId, session.user.id)))
      .returning({ name: graph.name });
    if (updated.length === 0) return { ok: false, message: "Graph not found." };
    await clearGatedGraphDiscover(graphId);

    revalidatePath("/dashboard", "layout");
    revalidatePath("/[graph]", "layout");
    revalidatePath("/u/[username]", "page");
    revalidatePath("/");
    updateTag(DISCOVER_TAG);
    return { ok: true, message: "Settings saved." };
  });
}

const GraphAccess = z.object({
  indexAccess: z.enum(ACCESS),
  defaultAccess: z.enum(ACCESS),
  showAuthors: z.boolean(),
  views: z.enum(VIEWS_MODE),
  showViewCountries: z.boolean(),
  newPagesInGraph: z.boolean(),
  /** Collections new pages join; only ones the owner belongs to are kept. */
  defaultCollections: z.array(z.string()).max(50),
  /** A new graph password, or "" to keep the current one. */
  password: z.union([z.literal(""), Password]),
  clearPassword: z.boolean(),
  /** The password now, when a new one is set and encrypted pages use it. */
  currentPassword: z.string().max(200).optional(),
  /** Set the new password without the current one: pages encrypted with it need republishing. */
  resetEncrypted: z.boolean().optional(),
});
export type GraphAccess = z.input<typeof GraphAccess>;

/**
 * Who can open the front page, what pages use unless they set their own access, bylines, and where
 * new pages from the extension go. Owner only.
 */
export async function updateGraphAccess(graphId: string, input: GraphAccess): Promise<FormState> {
  return withAction("dashboard.updateGraphAccess", async () => {
    const session = await getSession();
    if (!session) return { ok: false, message: "Your session expired. Please log in again." };
    const parsed = GraphAccess.safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const s = parsed.data;
    const g = await db.query.graph.findFirst({
      where: and(eq(graph.id, graphId), eq(graph.userId, session.user.id)),
    });
    if (!g) return { ok: false, message: "Graph not found." };

    const hasPassword = s.password ? true : s.clearPassword ? false : !!g.passwordHash;
    if ((s.indexAccess === "password" || s.defaultAccess === "password") && !hasPassword)
      return { ok: false, message: "Set a graph password to use password access." };
    if (
      ((!s.clearPassword && s.password) || s.currentPassword) &&
      !rateLimit(`password:user:${session.user.id}`, 30, 15 * 60 * 1000)
    )
      return { ok: false, message: "Too many changes. Try again in a few minutes." };

    const keep: string[] = [];
    for (const id of new Set(s.defaultCollections))
      if (await collectionRole(session.user.id, id)) keep.push(id);

    if (!hasPassword && (await pagesNeedingContainerPassword("graph", g.id)))
      return { ok: false, message: "Some pages still use the graph password. Change them first." };

    try {
    await db.transaction(async (tx) => {
      const lock = { scope: "graph", id: g.id, version: g.passwordVersion } as const;
      if (s.password)
        await setLockPassword(tx, lock, s.password, { currentPassword: s.currentPassword, reset: s.resetEncrypted });
      else if (s.clearPassword) await dropLock(tx, lock);
      // The default is for pages published from now on: pages that followed the old one keep it.
      if (s.defaultAccess !== g.defaultAccess)
        await tx
          .update(publication)
          .set({ access: g.defaultAccess })
          .where(and(eq(publication.graphId, g.id), eq(publication.access, "inherit")));
      await tx
        .update(graph)
        .set({
          indexAccess: s.indexAccess,
          defaultAccess: s.defaultAccess,
          showAuthors: s.showAuthors,
          views: s.views,
          showViewCountries: s.showViewCountries,
          newPagesInGraph: s.newPagesInGraph,
          ...(s.password
            ? { passwordHash: hashPassword(s.password), passwordVersion: g.passwordVersion + 1 }
            : s.clearPassword
              ? { passwordHash: null, passwordVersion: g.passwordVersion + 1 }
              : {}),
        })
        .where(eq(graph.id, g.id));
      await tx.delete(graphDefaultCollection).where(eq(graphDefaultCollection.graphId, g.id));
      if (keep.length)
        await tx.insert(graphDefaultCollection).values(keep.map((collectionId) => ({ graphId: g.id, collectionId })));
    });
    } catch (e) {
      if (e instanceof KeysError) return { ok: false, message: e.message, needCurrentPassword: e.need === "currentPassword" };
      throw e;
    }
    await clearGatedGraphDiscover(g.id);

    revalidatePath("/dashboard", "layout");
    revalidatePath("/[graph]", "layout");
    revalidatePath("/");
    updateTag(DISCOVER_TAG);
    return { ok: true, message: "Access saved." };
  });
}

/**
 * Permanently deletes a graph and every page published from it, members' pages included. Refused while
 * a moderator has acted on it, so deleting can't undo a suspension or removal; deleting the whole
 * account still works and blocklists the graph (src/lib/deletion.ts).
 */
export async function deleteGraph(graphId: string, confirmName: string): Promise<FormState> {
  return withAction("dashboard.deleteGraph", async () => {
    const session = await getSession();
    if (!session) return { ok: false, message: "Your session expired. Please log in again." };
    const g = await db.query.graph.findFirst({
      where: and(eq(graph.id, graphId), eq(graph.userId, session.user.id)),
    });
    if (!g) return { ok: false, message: "Graph not found." };
    if (confirmName.trim() !== g.name) return { ok: false, message: "Type the graph's name to confirm." };
    if (await graphUnderModeration(db, g))
      return { ok: false, message: "A moderator acted on this graph, so it can't be deleted. Contact us to delete it." };

    await db.transaction(async (tx) => {
      await purgeGraph(tx, g);
      await tx.insert(moderationAction).values({
        adminId: null,
        targetType: "graph",
        targetId: g.id,
        action: "delete_graph",
        reason: `Deleted by its owner: ${g.name}`,
      });
    });

    revalidatePath("/dashboard", "layout");
    revalidatePath("/[graph]", "layout");
    revalidatePath("/c/[id]", "layout");
    revalidatePath("/u/[username]", "page");
    revalidatePath("/");
    updateTag(DISCOVER_TAG);
    return { ok: true, message: `Deleted ${g.name}.` };
  });
}
