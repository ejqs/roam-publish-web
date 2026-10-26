import "server-only";
import { and, eq } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { ACCESS, collection, collectionEntry, VIEWS_MODE } from "@/db/schema";
import { CollectionName } from "@/lib/collections";
import { PdfStyleInput } from "@/lib/pdf";
import { Description } from "@/lib/descriptions";
import { DISCOVER_TAG } from "@/lib/discover";
import { clearGatedCollectionDiscover } from "@/lib/discover-rules";
import { pagesNeedingContainerPassword } from "@/lib/container-pages";
import { canEncryptWith, dropLock, KeysError, setLockPassword } from "@/lib/encryption";
import { saveContainerAccessBlocked } from "@/lib/control-rules";
import { hashPassword, Password } from "@/lib/gates";
import { rateLimit } from "@/lib/rate-limit";
import { collectionPageLink, narrowsAccess, pinBlocked } from "@/lib/pin-rules";
import { containerPasswordBlocked, pinOf } from "@/lib/pins";

export type CollectionResult =
  | { ok: true; message: string; slug?: string }
  | { ok: false; message: string; needCurrentPassword?: boolean };

export function revalidate() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/c/[id]", "layout");
  revalidatePath("/");
  updateTag(DISCOVER_TAG);
}

export const CollectionSettingsInput = z.object({
  name: CollectionName,
  description: Description,
  indexAccess: z.enum(ACCESS),
  defaultAccess: z.enum(ACCESS),
  showAuthors: z.boolean(),
  /** The Public or Discover chip on open pages here. */
  showVisibility: z.boolean().optional(),
  views: z.enum(VIEWS_MODE),
  showViewCountries: z.boolean(),
  /** Download PDF on pages here, unless a page overrides it (lib/pdf.ts). */
  pdfDownload: z.boolean().optional(),
  pdfStyle: PdfStyleInput.optional(),
  indexable: z.boolean(),
  searchListed: z.boolean(),
  featured: z.boolean(),
  /** Ignored: it follows the password. Kept so older forms still validate. */
  encryptNewPages: z.boolean().optional(),
  pagesLeaveGraph: z.boolean().optional(),
  discoverable: z.boolean(),
  rss: z.boolean(),
  password: z.union([z.literal(""), Password]),
  clearPassword: z.boolean(),
  /** The password now, when a new one is set and encrypted pages use it. */
  currentPassword: z.string().max(200).optional(),
  /** Set the new password without the current one: pages encrypted with it need republishing. */
  resetEncrypted: z.boolean().optional(),
});
export type CollectionSettings = z.input<typeof CollectionSettingsInput>;
/** Saves a collection's settings for its owner. */
export async function updateCollectionAs(uid: string, collectionId: string, input: CollectionSettings): Promise<CollectionResult> {
  const parsed = CollectionSettingsInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const s = parsed.data;
  const c = await db.query.collection.findFirst({
    where: and(eq(collection.id, collectionId), eq(collection.ownerId, uid)),
  });
  if (!c) return { ok: false, message: "Collection not found." };
  const hasPassword = s.password ? true : s.clearPassword ? false : !!c.passwordHash;
  const blocked = saveContainerAccessBlocked("collection", s, !!c.passwordHash, 0);
  if (blocked) return { ok: false, message: blocked };
  // New Password pages are encrypted whenever the password can encrypt; a shorter one only locks
  // them. There's no switch: `encryptNewPages` from older forms is ignored.
  const encryptNewPages =
    s.defaultAccess === "password" && !s.clearPassword && (await canEncryptWith({ scope: "collection", id: c.id }, s.password));
  if (!hasPassword && (await pagesNeedingContainerPassword("collection", c.id)))
    return { ok: false, message: "Some pages still use the collection password. Change them first." };
  const ownPin = await pinOf({ kind: "collection", collectionId: c.id });
  if (ownPin && narrowsAccess(c.indexAccess, s.indexAccess))
    return { ok: false, message: pinBlocked(collectionPageLink(c.name), ownPin)! };
  if (s.password || (s.clearPassword && c.passwordHash)) {
    if (ownPin && c.indexAccess === "password" && s.indexAccess === "password")
      return { ok: false, message: pinBlocked(collectionPageLink(c.name), ownPin)! };
    const pagePinned = await containerPasswordBlocked("collection", c.id, c.name);
    if (pagePinned) return { ok: false, message: pagePinned };
  }
  // Discover only takes open, indexable collections; a gate turns it off (see clearGatedCollectionDiscover).
  const open = s.indexAccess === "open" && s.indexable;
  if ((s.password || s.currentPassword) && !rateLimit(`password:user:${uid}`, 30, 15 * 60 * 1000))
    return { ok: false, message: "Too many changes. Try again in a few minutes." };
  try {
  await db.transaction(async (tx) => {
  const lock = { scope: "collection", id: c.id, version: c.passwordVersion } as const;
  if (s.password) await setLockPassword(tx, lock, s.password, { currentPassword: s.currentPassword, reset: s.resetEncrypted });
  else if (s.clearPassword) await dropLock(tx, lock);
  // The default is for pages added from now on: pages that followed the old one keep it.
  if (s.defaultAccess !== c.defaultAccess)
    await tx
      .update(collectionEntry)
      .set({ access: c.defaultAccess })
      .where(and(eq(collectionEntry.collectionId, c.id), eq(collectionEntry.access, "inherit")));
  await tx
    .update(collection)
    .set({
      name: s.name,
      description: s.description,
      indexAccess: s.indexAccess,
      defaultAccess: s.defaultAccess,
      showAuthors: s.showAuthors,
      ...(s.showVisibility !== undefined && { showVisibility: s.showVisibility }),
      views: s.views,
      showViewCountries: s.showViewCountries,
      ...(s.pdfDownload !== undefined && { pdfDownload: s.pdfDownload }),
      ...(s.pdfStyle && { pdfStyle: s.pdfStyle }),
      indexable: s.indexable,
      encryptNewPages,
      ...(s.pagesLeaveGraph !== undefined && { pagesLeaveGraph: s.pagesLeaveGraph }),
      searchListed: s.searchListed,
      featured: s.featured && open && s.defaultAccess === "open",
      discoverable: s.discoverable && open,
      rss: s.rss,
      ...(s.password
        ? { passwordHash: hashPassword(s.password), passwordVersion: c.passwordVersion + 1 }
        : s.clearPassword
          ? { passwordHash: null, passwordVersion: c.passwordVersion + 1 }
          : {}),
    })
    .where(eq(collection.id, c.id));
  });
  } catch (e) {
    if (e instanceof KeysError) return { ok: false, message: e.message, needCurrentPassword: e.need === "currentPassword" };
    throw e;
  }
  await clearGatedCollectionDiscover(c.id);
  revalidate();
  return { ok: true, message: "Settings saved." };
}
