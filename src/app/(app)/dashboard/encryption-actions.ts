"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { collection, collectionEntry, graph, lockKey, publication, publicationKey } from "@/db/schema";
import { auth } from "@/lib/auth";
import { type Change, logChange, logChanges } from "@/lib/changelog";
import { encryptExistingPagesBlocked } from "@/lib/control-rules";
import { DISCOVER_TAG } from "@/lib/discover";
import {
  contentKeyFor,
  decryptTree,
  ENCRYPT_PASSWORD_MIN,
  encryptBlocker,
  encryptPage,
  lockKeyOf,
  locksOf,
  newLockKey,
  plainHash,
  spotsOf,
  unprotectedSpots,
  type VersionedLock,
} from "@/lib/encryption";
import { verifyPassword } from "@/lib/gates";
import { manageablePublications } from "@/lib/graph-access";
import { rateLimit } from "@/lib/rate-limit";
import { indexFields } from "@/lib/tags";
import { withAction } from "@/lib/telemetry";

export type EncryptionResult = {
  ok: boolean;
  message: string;
  /** Passwords to ask for before trying again, keyed "{scope}:{id}". */
  need?: { lock: string; label: string }[];
  /** Turning it off needs one of the page's passwords. */
  needCurrentPassword?: boolean;
};

const Input = z.object({
  on: z.boolean(),
  /** Passwords typed in the dialog, keyed "{scope}:{id}". */
  passwords: z.record(z.string(), z.string().max(200)).optional(),
  /** Turning off: any password that opens the page. */
  currentPassword: z.string().max(200).optional(),
});

const lockKeyName = (l: { scope: string; id: string }) => `${l.scope}:${l.id}`;

async function lockHash(l: VersionedLock) {
  const cols = { passwordHash: true } as const;
  const row =
    l.scope === "graph"
      ? await db.query.graph.findFirst({ where: eq(graph.id, l.id), columns: cols })
      : l.scope === "collection"
        ? await db.query.collection.findFirst({ where: eq(collection.id, l.id), columns: cols })
        : l.scope === "publication"
          ? await db.query.publication.findFirst({ where: eq(publication.id, l.id), columns: cols })
          : await db.query.collectionEntry.findFirst({ where: eq(collectionEntry.id, l.id), columns: cols });
  return row?.passwordHash ?? null;
}

function revalidateAll() {
  revalidatePath("/dashboard", "layout");
  revalidatePath("/[graph]", "layout");
  revalidatePath("/c/[id]", "layout");
  revalidatePath("/");
  updateTag(DISCOVER_TAG);
}

/**
 * Encrypts a page with the passwords of every place it's shown, or stores it readable again. Only
 * people who manage the page itself. Encrypting asks once for each password that has no key pair
 * yet (set before encryption existed); turning it off asks for one that opens it, unless the
 * viewer unlocked it in this browser.
 */
export async function setEncryption(publicationId: string, raw: z.input<typeof Input>): Promise<EncryptionResult> {
  return withAction("dashboard.encryption.setEncryption", async () => {
    const session = await auth.api.getSession({ headers: await headers() });
    const uid = session?.user.id;
    if (!uid) return { ok: false, message: "Your session expired. Please log in again." };
    const parsed = Input.safeParse(raw);
    if (!parsed.success) return { ok: false, message: "Something went wrong. Try again." };
    const input = parsed.data;
    const typed = Object.keys(input.passwords ?? {}).length + (input.currentPassword ? 1 : 0);
    if (typed && !rateLimit(`encrypt:user:${uid}`, 30, 15 * 60 * 1000))
      return { ok: false, message: "Too many tries. Wait a few minutes and try again." };

    const [pub] = await db
      .select()
      .from(publication)
      .where(and(eq(publication.id, publicationId), manageablePublications(uid)))
      .limit(1);
    if (!pub || pub.removedAt) return { ok: false, message: "You can't change this page." };
    if (pub.encrypted === input.on) return { ok: true, message: input.on ? "Already encrypted." : "Not encrypted." };

    if (!input.on) {
      const ck = await contentKeyFor(db, pub, { passwords: input.currentPassword ? [input.currentPassword] : [] });
      const tree = ck && pub.cipher ? decryptTree(ck, pub.cipher, pub.id) : null;
      if (!tree) {
        const sealed = await db.select().from(publicationKey).where(eq(publicationKey.publicationId, pub.id));
        if (!sealed.length)
          return { ok: false, message: "No password opens this page right now. Republish it from Roam first." };
        return {
          ok: false,
          needCurrentPassword: true,
          message: input.currentPassword ? "That password doesn't open this page." : "Enter the page's password to turn off encryption.",
        };
      }
      const hash = plainHash(pub);
      await db.transaction(async (tx) => {
        await tx
          .update(publication)
          .set({ tree, ...indexFields(tree, pub), contentHash: hash, encrypted: false, cipher: null, needsRepublish: false })
          .where(eq(publication.id, pub.id));
        await tx.delete(publicationKey).where(eq(publicationKey.publicationId, pub.id));
      });
      logChange(pub, "access", "Encryption turned off");
      revalidateAll();
      return { ok: true, message: "Encryption turned off." };
    }

    const spots = await spotsOf(db, pub.id);
    const open = unprotectedSpots(spots);
    if (open.length)
      return {
        ok: false,
        message: `Set it to Password everywhere it's published first. It's ${open
          .map((s) => `${s.access === "password" ? "missing a password" : s.access === "members" ? "members only" : "open"} in ${s.label}`)
          .join(", ")}.`,
      };

    // Passwords set before encryption existed have no key pair: ask for each once.
    const need: { lock: string; label: string }[] = [];
    for (const l of locksOf(spots)) {
      if (await lockKeyOf(db, l)) continue;
      const label = spots.find((s) => s.lock && lockKeyName(s.lock) === lockKeyName(l))!.label;
      const typedPassword = input.passwords?.[lockKeyName(l)];
      if (!typedPassword) {
        need.push({ lock: lockKeyName(l), label });
        continue;
      }
      if (!verifyPassword(typedPassword, await lockHash(l)))
        return { ok: false, message: `That isn't the ${label} password.`, need: [{ lock: lockKeyName(l), label }] };
      if (typedPassword.length < ENCRYPT_PASSWORD_MIN)
        return {
          ok: false,
          message: `The ${label} password is too short to encrypt with. Encrypted pages need a password of at least ${ENCRYPT_PASSWORD_MIN} characters: set a longer one first.`,
        };
      await db.insert(lockKey).values({ scope: l.scope, targetId: l.id, ...newLockKey(typedPassword) }).onConflictDoNothing();
    }
    if (need.length)
      return { ok: false, need, message: `Enter the ${need.map((n) => n.label).join(" and ")} password once to encrypt with it.` };

    await db.transaction((tx) => encryptPage(tx, pub));
    logChange(pub, "access", "Encrypted with password");
    revalidateAll();
    return { ok: true, message: "Encrypted." };
  });
}

export type EncryptExistingResult = {
  ok: boolean;
  message: string;
  /** Pages that would be encrypted, or were. */
  encrypt?: string[];
  /** Readable pages left as they are, and why. */
  skipped?: { title: string; reason: string }[];
};

/**
 * Encrypts the pages already in a graph or collection, with the passwords of every place each is
 * shown, like turning on encryption page by page. Only its owner, and only pages they manage. A page
 * shown somewhere without a password, or behind one with no key pair, is skipped with the reason.
 * `preview` changes nothing: the dialog shows what would happen before it's confirmed.
 */
export async function encryptExistingPages(
  kind: "graph" | "collection",
  containerId: string,
  opts: { preview?: boolean } = {},
): Promise<EncryptExistingResult> {
  return withAction("dashboard.encryption.encryptExistingPages", async () => {
    const session = await auth.api.getSession({ headers: await headers() });
    const uid = session?.user.id;
    if (!uid) return { ok: false, message: "Your session expired. Please log in again." };
    const c =
      kind === "graph"
        ? await db.query.graph.findFirst({ where: and(eq(graph.id, containerId), eq(graph.userId, uid)) })
        : await db.query.collection.findFirst({ where: and(eq(collection.id, containerId), eq(collection.ownerId, uid)) });
    if (!c) return { ok: false, message: `Only the ${kind}'s owner can do this.` };
    const blocked = encryptExistingPagesBlocked(kind, {
      canEncrypt: !!c.passwordHash && !!(await lockKeyOf(db, { scope: kind, id: c.id })),
    });
    if (blocked) return { ok: false, message: blocked };

    const inContainer =
      kind === "graph"
        ? eq(publication.graphId, c.id)
        : inArray(
            publication.id,
            db.select({ id: collectionEntry.publicationId }).from(collectionEntry).where(eq(collectionEntry.collectionId, c.id)),
          );
    const readable = and(inContainer, eq(publication.encrypted, false), isNull(publication.removedAt));
    const pages = await db
      .select({ pub: publication, mine: sql<boolean>`${manageablePublications(uid)}` })
      .from(publication)
      .where(readable)
      .orderBy(publication.title);

    const encrypt: (typeof publication.$inferSelect)[] = [];
    const skipped: { title: string; reason: string }[] = [];
    for (const { pub, mine } of pages) {
      const reason = mine ? await encryptBlocker(db, await spotsOf(db, pub.id)) : "Published by another member";
      if (reason) skipped.push({ title: pub.title, reason });
      else encrypt.push(pub);
    }
    const titles = encrypt.map((p) => p.title);
    if (opts.preview) return { ok: true, message: "", encrypt: titles, skipped };
    if (!encrypt.length) return { ok: false, message: "No pages here can be encrypted right now.", encrypt: [], skipped };

    const done: Change[] = [];
    const doneTitles: string[] = [];
    for (const pub of encrypt) {
      // One page at a time, checked again inside its transaction, so a page changed since the
      // preview is skipped rather than encrypted where it shouldn't be.
      const reason = await db.transaction(async (tx) => {
        const [now] = await tx.select().from(publication).where(and(eq(publication.id, pub.id), readable)).for("update");
        if (!now) return "Changed since";
        const why = await encryptBlocker(tx, await spotsOf(tx, pub.id));
        if (!why) await encryptPage(tx, now);
        return why;
      });
      if (reason) skipped.push({ title: pub.title, reason });
      else {
        done.push({ graphId: pub.graphId, rootUid: pub.rootUid, category: "access", text: "Encrypted with password" });
        doneTitles.push(pub.title);
      }
    }
    logChanges(done);
    revalidateAll();
    const n = done.length;
    const left = skipped.length ? ` ${skipped.length.toLocaleString("en-US")} left as ${skipped.length === 1 ? "it was" : "they were"}.` : "";
    return {
      ok: n > 0,
      message: n ? `Encrypted ${n.toLocaleString("en-US")} ${n === 1 ? "page" : "pages"}.${left}` : "No pages here can be encrypted right now.",
      encrypt: doneTitles,
      skipped,
    };
  });
}
