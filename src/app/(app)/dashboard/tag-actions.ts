"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { publication } from "@/db/schema";
import { auth } from "@/lib/auth";
import { logChange } from "@/lib/changelog";
import { manageablePublications } from "@/lib/graph-access";
import { rateLimit } from "@/lib/rate-limit";
import { effectiveTags, extractTags, MAX_TAGS, normalizeTag } from "@/lib/tags";

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

export async function setPageTags(publicationId: string, raw: { add?: string[]; remove?: string[] }): Promise<TagResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  const uid = session?.user.id;
  if (!uid) return { ok: false, message: "Your session expired. Please log in again." };
  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const add = parsed.data.add as string[];
  const remove = parsed.data.remove as string[];
  if (!add.length && !remove.length) return { ok: true, message: "" };
  if (!rateLimit(`tags:user:${uid}`, 120, 15 * 60 * 1000))
    return { ok: false, message: "Too many changes. Try again in a few minutes." };

  const pub = await db.query.publication.findFirst({
    where: and(eq(publication.id, publicationId), manageablePublications(uid)),
  });
  if (!pub) return { ok: false, message: "You can't change this page." };

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
  if (add.some((t) => !tags.includes(t))) return { ok: false, message: `A page can have up to ${MAX_TAGS} tags.` };

  await db.update(publication).set({ ...edits, tags }).where(eq(publication.id, pub.id));
  const before = new Set(pub.tags);
  const plus = tags.filter((t) => !before.has(t)).map((t) => `+#${t}`);
  const minus = pub.tags.filter((t) => !tags.includes(t)).map((t) => `−#${t}`);
  if (plus.length || minus.length) logChange(pub, `Tags changed on the website: ${[...plus, ...minus].join(" ")}`);

  revalidatePath("/dashboard", "layout");
  revalidatePath("/[graph]", "layout");
  revalidatePath("/c/[id]", "layout");
  return { ok: true, message: plus.length || minus.length ? "Tags updated." : "" };
}
