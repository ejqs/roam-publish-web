"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { collectionEntry, publication } from "@/db/schema";
import { auth } from "@/lib/auth";
import { type Change, logChange, logChanges } from "@/lib/changelog";
import { manageablePublications } from "@/lib/graph-access";
import { rateLimit } from "@/lib/rate-limit";
import { effectiveTags, extractTags, MAX_TAGS, normalizeTag } from "@/lib/tags";
import { withAction } from "@/lib/telemetry";

/**
 * Tags edited on the website. Edits are kept as `tagsAdded` and `tagsHidden`, so they survive
 * republishing: a #tag removed here stays removed even though the Roam text still has it.
 */

export type TagResult = { ok: boolean; message: string };

const Tag = z
  .string()
  .transform((t) => normalizeTag(t.replace(/^#+/, "")))
  .refine((t): t is string => t !== null, "Tags need 1–100 characters and can't start with a dot.");
const Input = z.object({
  add: z.array(Tag).max(MAX_TAGS).default([]),
  remove: z.array(Tag).max(MAX_TAGS).default([]),
});

type Pub = Pick<typeof publication.$inferSelect, "tree" | "tags" | "tagsAdded" | "tagsHidden">;

/**
 * One page's tags after adding and removing some. Removing a tag from the Roam text hides it;
 * removing one added here drops it; adding un-hides it, or records it as added.
 */
function applyTagEdit(pub: Pub, add: string[], remove: string[]) {
  const fromRoam = new Set(extractTags(pub.tree));
  const added = new Set(pub.tagsAdded);
  const hidden = new Set(pub.tagsHidden);
  for (const t of remove) {
    added.delete(t);
    if (fromRoam.has(t)) hidden.add(t);
  }
  for (const t of add) {
    hidden.delete(t);
    if (!fromRoam.has(t)) added.add(t);
  }
  const edits = { tagsAdded: [...added], tagsHidden: [...hidden] };
  const tags = effectiveTags([...fromRoam], edits);
  const before = new Set(pub.tags);
  return {
    edits,
    tags,
    /** Some added tags didn't fit under MAX_TAGS. */
    full: add.some((t) => !tags.includes(t)),
    summary: [
      ...tags.filter((t) => !before.has(t)).map((t) => `+#${t}`),
      ...pub.tags.filter((t) => !tags.includes(t)).map((t) => `−#${t}`),
    ],
  };
}

async function sessionUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

function revalidateTags() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/[graph]", "layout");
  revalidatePath("/c/[id]", "layout");
}

const EXPIRED: TagResult = { ok: false, message: "Your session expired. Please log in again." };
const TOO_MANY: TagResult = { ok: false, message: "Too many changes. Try again in a few minutes." };

export async function setPageTags(publicationId: string, raw: { add?: string[]; remove?: string[] }): Promise<TagResult> {
  return withAction("dashboard.tags.setPageTags", async () => {
    const uid = await sessionUser();
    if (!uid) return EXPIRED;
    const parsed = Input.safeParse(raw);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const add = parsed.data.add as string[];
    const remove = parsed.data.remove as string[];
    if (!add.length && !remove.length) return { ok: true, message: "" };
    if (!rateLimit(`tags:user:${uid}`, 120, 15 * 60 * 1000)) return TOO_MANY;

    const pub = await db.query.publication.findFirst({
      where: and(eq(publication.id, publicationId), manageablePublications(uid)),
    });
    if (!pub) return { ok: false, message: "You can't change this page." };

    const next = applyTagEdit(pub, add, remove);
    if (next.full) return { ok: false, message: `A page can have up to ${MAX_TAGS} tags.` };
    if (!next.summary.length) return { ok: true, message: "" };
    await db.update(publication).set({ ...next.edits, tags: next.tags }).where(eq(publication.id, pub.id));
    logChange(pub, `Tags changed on the website: ${next.summary.join(" ")}`);
    revalidateTags();
    return { ok: true, message: "Tags updated." };
  });
}

const BulkInput = Input.extend({
  kind: z.enum(["graph", "collection"]),
  /** Publication ids from a graph's list, or entry ids from a collection's. */
  ids: z.array(z.string()).min(1).max(100),
});

const pages = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "page" : "pages"}`;

/**
 * Adds and removes tags on several pages at once, from the dashboard's graph or collection list.
 * Tags belong to the page, so this changes them everywhere it appears. Pages the viewer can't
 * manage are skipped.
 */
export async function bulkSetTags(raw: { kind: "graph" | "collection"; ids: string[]; add?: string[]; remove?: string[] }): Promise<TagResult> {
  return withAction("dashboard.tags.bulkSetTags", async () => {
    const uid = await sessionUser();
    if (!uid) return EXPIRED;
    const parsed = BulkInput.safeParse(raw);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const add = parsed.data.add as string[];
    const remove = parsed.data.remove as string[];
    if (!add.length && !remove.length) return { ok: false, message: "Nothing to change." };
    if (!rateLimit(`tags:user:${uid}`, 120, 15 * 60 * 1000)) return TOO_MANY;

    const pubIds =
      parsed.data.kind === "graph"
        ? parsed.data.ids
        : (
            await db
              .select({ id: collectionEntry.publicationId })
              .from(collectionEntry)
              .where(inArray(collectionEntry.id, parsed.data.ids))
          ).map((r) => r.id);
    const unique = [...new Set(pubIds)];
    const rows = unique.length
      ? await db.query.publication.findMany({ where: and(inArray(publication.id, unique), manageablePublications(uid)) })
      : [];
    const skipped = unique.length - rows.length;
    if (rows.length === 0) return { ok: false, message: "You can only change tags on pages you manage." };

    let changed = 0;
    let full = 0;
    const log: Change[] = [];
    for (const pub of rows) {
      const next = applyTagEdit(pub, add, remove);
      if (next.full) full++;
      if (!next.summary.length) continue;
      await db.update(publication).set({ ...next.edits, tags: next.tags }).where(eq(publication.id, pub.id));
      changed++;
      log.push({ graphId: pub.graphId, rootUid: pub.rootUid, text: `Tags changed on the website: ${next.summary.join(" ")}` });
    }
    logChanges(log);
    revalidateTags();

    const notes = [
      skipped > 0 && `${pages(skipped)} skipped: you can only change tags on pages you manage.`,
      full > 0 && `${pages(full)} reached the ${MAX_TAGS}-tag limit.`,
    ].filter(Boolean);
    if (changed === 0) return { ok: false, message: notes.join(" ") || "Nothing changed: the pages already had those tags." };
    return { ok: true, message: [`Updated ${pages(changed)}.`, ...notes].join(" ") };
  });
}
