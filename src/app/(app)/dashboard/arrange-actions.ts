"use server";

import { and, eq, inArray, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { collection, collectionEntry, folder, FRONT_LAYOUTS, graph, publication } from "@/db/schema";
import { auth } from "@/lib/auth";
import { arrangeBlocked } from "@/lib/control-rules";
import { flatten, folderSlugs, folderTree, MAX_FOLDERS } from "@/lib/folders";
import { withAction } from "@/lib/telemetry";

export type ArrangeTarget = { kind: "graph" | "collection"; id: string };
export type ArrangeResult = { ok: true; message: string } | { ok: false; message: string };

const Id = z.string().min(1).max(64);
const Arrangement = z.object({
  layout: z.enum(FRONT_LAYOUTS),
  /** In order. Ids of folders already saved are kept; any other id makes a new folder. */
  folders: z.array(z.object({ id: Id, name: z.string().max(200), parentId: Id.nullable() })).max(MAX_FOLDERS),
  /**
   * Where pages go, only for the ones that moved: page id (a publication on a graph, an entry in a
   * collection) to folder id, or null for loose.
   */
  moves: z.record(Id, Id.nullable()),
});
export type ArrangementInput = z.input<typeof Arrangement>;

/** Saves a graph's or collection's folders, which page is in each, and its front page layout. Owner only. */
export async function saveArrangement(target: ArrangeTarget, input: ArrangementInput): Promise<ArrangeResult> {
  return withAction("dashboard.saveArrangement", async () => {
    const session = await auth.api.getSession({ headers: await headers() });
    const uid = session?.user.id;
    if (!uid) return { ok: false, message: "Your session expired. Please log in again." };
    const parsed = Arrangement.safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const s = parsed.data;
    const blocked = arrangeBlocked(s.folders);
    if (blocked) return { ok: false, message: blocked };

    const isGraph = target.kind === "graph";
    const owned = isGraph
      ? await db.query.graph.findFirst({ where: and(eq(graph.id, target.id), eq(graph.userId, uid)) })
      : await db.query.collection.findFirst({ where: and(eq(collection.id, target.id), eq(collection.ownerId, uid)) });
    if (!owned) return { ok: false, message: `Only the ${target.kind}'s owner can arrange it.` };
    const place = isGraph ? { graphId: target.id } : { collectionId: target.id };
    const inPlace = isGraph ? eq(folder.graphId, target.id) : eq(folder.collectionId, target.id);

    await db.transaction(async (tx) => {
      const existing = new Set((await tx.select({ id: folder.id }).from(folder).where(inPlace)).map((f) => f.id));
      // Saved folders keep their ids; the rest get new ones.
      const real = new Map(s.folders.map((f) => [f.id, existing.has(f.id) ? f.id : crypto.randomUUID()]));
      const keep = s.folders.filter((f) => existing.has(f.id)).map((f) => f.id);
      // Kept folders let go of their parents first, so deleting a parent doesn't take them along, and
      // of their slugs, which are unique per place and handed out again below.
      for (const id of keep) await tx.update(folder).set({ slug: `~${id}`, parentId: null }).where(eq(folder.id, id));
      await tx.delete(folder).where(keep.length ? and(inPlace, notInArray(folder.id, keep)) : inPlace);
      const slugs = folderSlugs(s.folders);
      const position = new Map(s.folders.map((f, i) => [f.id, i]));
      // Parents first, so every new folder's parent exists when it's added.
      for (const f of flatten(folderTree(s.folders))) {
        const row = {
          name: f.name.trim(),
          slug: slugs.get(f.id)!,
          parentId: f.parentId ? real.get(f.parentId)! : null,
          position: position.get(f.id)!,
        };
        if (existing.has(f.id)) await tx.update(folder).set(row).where(eq(folder.id, f.id));
        else await tx.insert(folder).values({ id: real.get(f.id)!, ...place, ...row });
      }

      const byFolder = new Map<string | null, string[]>();
      for (const [item, to] of Object.entries(s.moves)) {
        // A move into a folder that isn't being saved leaves the page where it is.
        if (to && !real.has(to)) continue;
        const key = to ? real.get(to)! : null;
        byFolder.set(key, [...(byFolder.get(key) ?? []), item]);
      }
      for (const [to, items] of byFolder) {
        if (isGraph)
          await tx
            .update(publication)
            .set({ folderId: to })
            .where(and(eq(publication.graphId, target.id), inArray(publication.id, items)));
        else
          await tx
            .update(collectionEntry)
            .set({ folderId: to })
            .where(and(eq(collectionEntry.collectionId, target.id), inArray(collectionEntry.id, items)));
      }

      if (isGraph) await tx.update(graph).set({ frontLayout: s.layout }).where(eq(graph.id, target.id));
      else await tx.update(collection).set({ frontLayout: s.layout }).where(eq(collection.id, target.id));
    });

    revalidatePath("/dashboard", "layout");
    revalidatePath(isGraph ? "/[graph]" : "/c/[id]", "layout");
    return { ok: true, message: "Saved." };
  });
}
