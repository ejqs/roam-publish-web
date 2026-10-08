import "server-only";
import {
  createCipheriv,
  createHash,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  type KeyObject,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { type Blocker, isUnlocked } from "@/lib/gates";
import { ENCRYPT_PASSWORD_MIN } from "./encryption-rules";
import { type SealedPage, UNLOCK_PROOF_INFO } from "./reader-crypto";
import { entryPath, publicationPath } from "./publications";
import {
  collection,
  collectionEntry,
  graph,
  type LockScope,
  lockKey,
  type Node,
  publication,
  publicationKey,
} from "@/db/schema";

/**
 * Pages encrypted with their password. Each password (a graph's, a collection's, a page's own or a
 * collection entry's) gets an X25519 key pair whose private key is stored encrypted with a key made
 * from the password. An encrypted page's content is AES-256-GCM under a random content key, sealed
 * once to the key pair of every password that opens it. So republishing needs no password (it seals
 * to the public keys), while reading needs one, typed in the reader's browser: it derives the
 * password's key there, proves it to the server with `unlockProof` (lib/reader-crypto.ts), gets the
 * wrapped private key back and opens pages itself. The server never decrypts a page for a reader.
 *
 * Stored strings are "v1.{part}.{part}…", each part base64url.
 */

export { ENCRYPT_PASSWORD_MIN } from "./encryption-rules";

export type LockRef = { scope: LockScope; id: string };
export type VersionedLock = LockRef & { version: number };
const lockId = (l: LockRef) => `${l.scope}:${l.id}`;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = typeof db | Tx;

// --- Primitives --------------------------------------------------------------------------------

const b64 = (b: Buffer) => b.toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url");

function gcmSeal(key: Buffer, plaintext: Buffer, aad: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(aad));
  const body = Buffer.concat([c.update(plaintext), c.final()]);
  return [b64(iv), b64(c.getAuthTag()), b64(body)];
}

/** Null when the key is wrong or the data was changed. */
function gcmOpen(key: Buffer, [iv, tag, body]: string[], aad: string) {
  try {
    const d = createDecipheriv("aes-256-gcm", key, unb64(iv));
    d.setAAD(Buffer.from(aad));
    d.setAuthTag(unb64(tag));
    return Buffer.concat([d.update(unb64(body)), d.final()]);
  } catch {
    return null;
  }
}

function serverKey(purpose: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return Buffer.from(hkdfSync("sha256", secret, "", `roam-publish:${purpose}`, 32));
}

/** Encrypted with the server secret, for values only the server reads back. */
export function serverSeal(purpose: string, value: Buffer, aad: string) {
  return ["v1", ...gcmSeal(serverKey(purpose), value, aad)].join(".");
}

export function serverOpen(purpose: string, sealed: string, aad: string) {
  const [v, ...parts] = sealed.split(".");
  return v === "v1" && parts.length === 3 ? gcmOpen(serverKey(purpose), parts, aad) : null;
}

// Strong enough that a leaked database makes each guess cost ~0.1s; one per unlock and setting.
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const passwordKey = (password: string, salt: Buffer) => scryptSync(password, salt, 32, SCRYPT);

/** A new key pair for a password: what `lock_key` stores. */
export function newLockKey(password: string) {
  const pair = generateKeyPairSync("x25519");
  const { kek, wrapped } = wrapPrivateKey(pair.privateKey.export({ type: "pkcs8", format: "der" }), password);
  return {
    publicKey: b64(pair.publicKey.export({ type: "spki", format: "der" })),
    wrappedPrivateKey: wrapped,
    proofHash: proofHashOf(kek),
  };
}

/** What `lock_key.proof_hash` stores for a password's key: the hash of the proof its readers send. */
export function proofHashOf(kek: Buffer) {
  const proof = Buffer.from(hkdfSync("sha256", kek, "", UNLOCK_PROOF_INFO, 32));
  return b64(createHash("sha256").update(proof).digest());
}

/** Whether an unlock proof (base64url) matches the stored hash. */
export function proofMatches(proof: string, stored: string) {
  const a = createHash("sha256").update(unb64(proof)).digest();
  const b = unb64(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

function wrapPrivateKey(pkcs8: Buffer, password: string) {
  const salt = randomBytes(16);
  const kek = passwordKey(password, salt);
  return { kek, wrapped: ["v1", b64(salt), ...gcmSeal(kek, pkcs8, "lock-key")].join(".") };
}

/** The password's key, if it opens this wrapped private key. */
export function passwordKeyFor(wrapped: string, password: string) {
  const [, salt] = wrapped.split(".");
  const kek = passwordKey(password, unb64(salt));
  return unwrapPrivateKey(wrapped, kek) ? kek : null;
}

function unwrapPrivateKey(wrapped: string, kek: Buffer): KeyObject | null {
  const [v, , ...parts] = wrapped.split(".");
  if (v !== "v1" || parts.length !== 3) return null;
  const der = gcmOpen(kek, parts, "lock-key");
  return der ? createPrivateKey({ key: der, format: "der", type: "pkcs8" }) : null;
}

/** The same key pair under a new password. */
export function rewrapLockKey(wrapped: string, kek: Buffer, newPassword: string) {
  const key = unwrapPrivateKey(wrapped, kek);
  if (!key) return null;
  const next = wrapPrivateKey(key.export({ type: "pkcs8", format: "der" }), newPassword);
  return { wrappedPrivateKey: next.wrapped, proofHash: proofHashOf(next.kek) };
}

function sharedKey(privateKey: KeyObject, publicKey: KeyObject, ephemeral: Buffer) {
  const shared = diffieHellman({ privateKey, publicKey });
  return Buffer.from(hkdfSync("sha256", shared, ephemeral, "roam-publish:content-key", 32));
}

/** Seals a content key to a password's public key. */
export function sealContentKey(publicKey: string, contentKey: Buffer) {
  const recipient = createPublicKey({ key: unb64(publicKey), format: "der", type: "spki" });
  const eph = generateKeyPairSync("x25519");
  const ephPub = eph.publicKey.export({ type: "spki", format: "der" });
  return ["v1", b64(ephPub), ...gcmSeal(sharedKey(eph.privateKey, recipient, ephPub), contentKey, "content-key")].join(".");
}

function openContentKey(sealed: string, privateKey: KeyObject) {
  const [v, eph, ...parts] = sealed.split(".");
  if (v !== "v1" || parts.length !== 3) return null;
  const ephPub = unb64(eph);
  const sender = createPublicKey({ key: ephPub, format: "der", type: "spki" });
  return gcmOpen(sharedKey(privateKey, sender, ephPub), parts, "content-key");
}

export function encryptTree(contentKey: Buffer, tree: Node, publicationId: string) {
  return ["v1", ...gcmSeal(contentKey, Buffer.from(JSON.stringify(tree)), `tree:${publicationId}`)].join(".");
}

export function decryptTree(contentKey: Buffer, cipher: string, publicationId: string): Node | null {
  const [v, ...parts] = cipher.split(".");
  const plain = v === "v1" && parts.length === 3 ? gcmOpen(contentKey, parts, `tree:${publicationId}`) : null;
  return plain ? (JSON.parse(plain.toString()) as Node) : null;
}

/** What an encrypted page's `tree` holds: nothing. */
export const emptyTree = (rootUid: string): Node => ({ uid: rootUid, string: "", children: [] });

/** An encrypted page's content hash is stored encrypted, so a leaked database can't confirm guesses. */
export const sealHash = (publicationId: string, hash: string) =>
  serverSeal("content-hash", Buffer.from(hash), publicationId);

/**
 * A page encrypted in Roam stores the extension's own keyed hash ("k1.{hex}", lib/e2e-publish.ts), which
 * says whether it changed without telling roam.pub anything about the text.
 */
export const isKeyedHash = (hash: string) => /^k1\.[0-9a-f]{64}$/.test(hash);

/** The content hash of any page as the extension compares it: plain, or keyed when encrypted in Roam. */
export function plainHash(p: { id: string; encrypted: boolean; contentHash: string }) {
  if (!p.encrypted || isKeyedHash(p.contentHash)) return p.contentHash;
  return serverOpen("content-hash", p.contentHash, p.id)?.toString() ?? "";
}

// --- Where a page is shown ---------------------------------------------------------------------

export type Spot = {
  kind: "graph" | "entry";
  /** The graph's or collection's name. */
  label: string;
  access: "open" | "password" | "members";
  /** The password that opens it here, when it uses one. */
  lock: VersionedLock | null;
  /** False for a graph place switched off ("Show in graph"): it doesn't count until it's back. */
  shown: boolean;
  /** The page's address here. */
  path: string;
};

/** Every place a page can be read, with the password each one uses. */
export async function spotsOf(tx: Db, publicationId: string): Promise<Spot[]> {
  const [row] = await tx
    .select({ pub: publication, g: graph })
    .from(publication)
    .innerJoin(graph, eq(graph.id, publication.graphId))
    .where(eq(publication.id, publicationId))
    .limit(1);
  if (!row) return [];
  const { pub, g } = row;
  const entries = await tx
    .select({ entry: collectionEntry, c: collection })
    .from(collectionEntry)
    .innerJoin(collection, eq(collection.id, collectionEntry.collectionId))
    .where(eq(collectionEntry.publicationId, publicationId))
    .orderBy(collection.name);
  const graphAccess = pub.access === "inherit" ? g.defaultAccess : pub.access;
  return [
    {
      kind: "graph",
      label: g.name,
      access: graphAccess,
      lock: pub.passwordHash
        ? { scope: "publication", id: pub.id, version: pub.passwordVersion }
        : g.passwordHash
          ? { scope: "graph", id: g.id, version: g.passwordVersion }
          : null,
      shown: pub.inGraph,
      path: publicationPath(g.name, pub.rootUid, pub.title),
    },
    ...entries.map(({ entry, c }): Spot => ({
      kind: "entry",
      label: c.name,
      access: entry.access === "inherit" ? c.defaultAccess : entry.access,
      lock: entry.passwordHash
        ? { scope: "entry", id: entry.id, version: entry.passwordVersion }
        : c.passwordHash
          ? { scope: "collection", id: c.id, version: c.passwordVersion }
          : null,
      shown: true,
      path: entryPath(c.slug, entry.entryUid, pub.title),
    })),
  ];
}

/** Shown places that don't use a password: an encrypted page can't be in any. */
export const unprotectedSpots = (spots: Spot[]) =>
  spots.filter((s) => s.shown && (s.access !== "password" || !s.lock));

/**
 * The passwords a page's content key is sealed to: those of its shown places, plus its hidden graph
 * place's when that uses one, so showing it in the graph again needs nothing more.
 */
export function locksOf(spots: Spot[]) {
  const out = new Map<string, VersionedLock>();
  for (const s of spots)
    if (s.access === "password" && s.lock && (s.shown || s.kind === "graph")) out.set(lockId(s.lock), s.lock);
  return [...out.values()];
}

// --- Content keys ------------------------------------------------------------------------------

/** What can open an encrypted page: passwords typed just now. */
export type Credentials = {
  passwords?: string[];
  /** Opened before the change, when the change itself would stop the password from fitting. */
  contentKey?: Buffer | null;
  /**
   * When nothing opens the page, add the new places anyway and mark it Needs republish: they open
   * once it's republished from Roam, which seals new content to every place without a password.
   */
  orRepublish?: boolean;
};

/** Opens a page's content key with any of its sealed keys a typed password opens. */
export async function contentKeyFor(tx: Db, pub: { id: string }, creds: Credentials = {}) {
  if (!creds.passwords?.length) return null;
  const sealed = await tx
    .select({ k: publicationKey, lk: lockKey })
    .from(publicationKey)
    .innerJoin(lockKey, and(eq(lockKey.scope, publicationKey.scope), eq(lockKey.targetId, publicationKey.targetId)))
    .where(eq(publicationKey.publicationId, pub.id));
  for (const password of creds.passwords)
    for (const { k, lk } of sealed) {
      const kek = passwordKeyFor(lk.wrappedPrivateKey, password);
      const key = kek && unwrapPrivateKey(lk.wrappedPrivateKey, kek);
      const ck = key && openContentKey(k.sealedKey, key);
      if (ck) return ck;
    }
  return null;
}

/**
 * Opens encrypted pages with one typed password and nothing else (not the viewer's cookies), so
 * only pages that password opens. Each password key is derived once per lock, since each costs an
 * scrypt. Null for a page the password doesn't open.
 */
export function passwordOpener(password: string) {
  const keys = new Map<string, KeyObject | null>();
  return async (tx: Db, pub: { id: string; cipher: string | null }): Promise<Node | null> => {
    if (!pub.cipher) return null;
    const sealed = await tx
      .select({ k: publicationKey, lk: lockKey })
      .from(publicationKey)
      .innerJoin(lockKey, and(eq(lockKey.scope, publicationKey.scope), eq(lockKey.targetId, publicationKey.targetId)))
      .where(eq(publicationKey.publicationId, pub.id));
    for (const { k, lk } of sealed) {
      const id = lockId({ scope: k.scope, id: k.targetId });
      if (!keys.has(id)) {
        const kek = passwordKeyFor(lk.wrappedPrivateKey, password);
        keys.set(id, kek && unwrapPrivateKey(lk.wrappedPrivateKey, kek));
      }
      const key = keys.get(id);
      const ck = key && openContentKey(k.sealedKey, key);
      const tree = ck && decryptTree(ck, pub.cipher, pub.id);
      if (tree) return tree;
    }
    return null;
  };
}

export async function lockKeyOf(tx: Db, l: LockRef) {
  return tx.query.lockKey.findFirst({ where: and(eq(lockKey.scope, l.scope), eq(lockKey.targetId, l.id)) });
}

/** Why a page's keys can't follow a change, for the action to pass on. */
export class KeysError extends Error {
  constructor(
    message: string,
    readonly need?: "currentPassword",
  ) {
    super(message);
  }
}

/**
 * Seals the page's content key to exactly the passwords that open it now, after a change to where
 * it's shown or which password a place uses. Adding a password needs the content key, so the
 * credentials must open one of the page's current ones, unless `orRepublish`. Throws KeysError, to
 * roll back the change. True when the new places wait for a republish.
 */
export async function syncPublicationKeys(tx: Tx, publicationId: string, creds: Credentials = {}): Promise<boolean> {
  let waits = false;
  const pub = await tx.query.publication.findFirst({ where: eq(publication.id, publicationId) });
  if (!pub?.encrypted) return false;
  const spots = await spotsOf(tx, publicationId);
  const open = unprotectedSpots(spots);
  if (open.length)
    throw new KeysError(
      `Encrypted pages can only use Password, and it would be ${open[0].access === "members" ? "members only" : "open"} in ${open[0].label}. Turn off encryption first.`,
    );
  const want = locksOf(spots);
  const have = await tx.select().from(publicationKey).where(eq(publicationKey.publicationId, publicationId));
  const wanted = new Set(want.map(lockId));
  const missing = want.filter((l) => !have.some((h) => h.scope === l.scope && h.targetId === l.id));
  const extra = have.filter((h) => !wanted.has(lockId({ scope: h.scope, id: h.targetId })));
  if (missing.length) {
    const ck = creds.contentKey ?? (await contentKeyFor(tx, pub, creds));
    if (!ck && creds.orRepublish) waits = true;
    else if (!ck) {
      const current = spots.find((s) => s.lock && have.some((h) => h.scope === s.lock!.scope && h.targetId === s.lock!.id));
      throw new KeysError(
        `This page is encrypted. Enter its current password${current ? ` (${current.label})` : ""} to continue.`,
        "currentPassword",
      );
    }
    for (const l of missing) {
      const lk = await lockKeyOf(tx, l);
      if (!lk) {
        const spot = spots.find((s) => s.lock && lockId(s.lock) === lockId(l));
        throw new KeysError(
          `The ${spot?.label ?? "new"} password can't be used for an encrypted page. Encrypted pages need a password of at least ${ENCRYPT_PASSWORD_MIN} characters: set a longer one.`,
        );
      }
      if (!ck) continue;
      await tx
        .insert(publicationKey)
        .values({ publicationId, scope: l.scope, targetId: l.id, sealedKey: sealContentKey(lk.publicKey, ck) });
    }
  }
  for (const h of extra)
    await tx
      .delete(publicationKey)
      .where(
        and(
          eq(publicationKey.publicationId, publicationId),
          eq(publicationKey.scope, h.scope),
          eq(publicationKey.targetId, h.targetId),
        ),
      );
  if (waits) await tx.update(publication).set({ needsRepublish: true }).where(eq(publication.id, publicationId));
  return waits;
}

/** Pages whose content key is sealed to this password. */
export async function pagesSealedTo(tx: Db, l: LockRef) {
  const rows = await tx
    .select({ id: publicationKey.publicationId })
    .from(publicationKey)
    .where(and(eq(publicationKey.scope, l.scope), eq(publicationKey.targetId, l.id)));
  return rows.map((r) => r.id);
}

/**
 * Keeps a password's key pair in step with a new password. With pages sealed to it, the same key
 * pair is re-encrypted under the new password, which needs the current one; `reset` instead starts a new key pair, and those pages need republishing to be
 * read in this place again. Without such pages, a new key pair is made when the new password is long
 * enough, and none kept otherwise. Throws KeysError.
 */
export async function setLockPassword(
  tx: Tx,
  l: VersionedLock,
  password: string,
  opts: { currentPassword?: string; reset?: boolean } = {},
) {
  const sealed = await pagesSealedTo(tx, l);
  const lk = await lockKeyOf(tx, l);
  const where = and(eq(lockKey.scope, l.scope), eq(lockKey.targetId, l.id));
  if (sealed.length && password.length < ENCRYPT_PASSWORD_MIN)
    throw new KeysError(`It protects encrypted pages, so it needs at least ${ENCRYPT_PASSWORD_MIN} characters.`);
  if (sealed.length && lk && !opts.reset) {
    const kek = opts.currentPassword ? passwordKeyFor(lk.wrappedPrivateKey, opts.currentPassword) : null;
    const rewrapped = kek && rewrapLockKey(lk.wrappedPrivateKey, kek, password);
    if (!rewrapped)
      throw new KeysError(
        opts.currentPassword
          ? "The current password isn't right."
          : `It protects ${sealed.length === 1 ? "an encrypted page" : `${sealed.length} encrypted pages`}. Enter the current password to change it.`,
        "currentPassword",
      );
    await tx.update(lockKey).set(rewrapped).where(where);
    return;
  }
  if (sealed.length) {
    await tx
      .delete(publicationKey)
      .where(and(eq(publicationKey.scope, l.scope), eq(publicationKey.targetId, l.id)));
    await tx.update(publication).set({ needsRepublish: true }).where(inArray(publication.id, sealed));
  }
  await tx.delete(lockKey).where(where);
  if (password.length >= ENCRYPT_PASSWORD_MIN) await tx.insert(lockKey).values({ scope: l.scope, targetId: l.id, ...newLockKey(password) });
}

/** A password was removed: its key pair goes, and any keys sealed to it. */
export async function dropLock(tx: Db, l: LockRef) {
  await tx.delete(publicationKey).where(and(eq(publicationKey.scope, l.scope), eq(publicationKey.targetId, l.id)));
  await tx.delete(lockKey).where(and(eq(lockKey.scope, l.scope), eq(lockKey.targetId, l.id)));
}

/** The wrapped private key a reader's browser opens pages with, when the lock has one. */
export type ReaderKey = { wrappedPrivateKey: string };

/**
 * A reader unlocked with the password itself (no proof yet): makes the key pair first for a password
 * set before encryption existed (when it's long enough), and stores the proof hash a key made before
 * proofs lacks, so this browser and every later one unlock with a proof instead.
 */
export async function readerKeyFromPassword(l: LockRef, password: string): Promise<ReaderKey | null> {
  let lk = await lockKeyOf(db, l);
  if (!lk && password.length >= ENCRYPT_PASSWORD_MIN) {
    await db.insert(lockKey).values({ scope: l.scope, targetId: l.id, ...newLockKey(password) }).onConflictDoNothing();
    lk = await lockKeyOf(db, l);
  }
  const kek = lk && passwordKeyFor(lk.wrappedPrivateKey, password);
  if (!lk || !kek) return null;
  if (!lk.proofHash)
    await db
      .update(lockKey)
      .set({ proofHash: proofHashOf(kek) })
      .where(and(eq(lockKey.scope, l.scope), eq(lockKey.targetId, l.id), eq(lockKey.wrappedPrivateKey, lk.wrappedPrivateKey)));
  return { wrappedPrivateKey: lk.wrappedPrivateKey };
}

/**
 * Checks a reader's unlock proof. "password" when the lock's key predates proofs, or it has no key
 * pair (a short or older password): the browser sends the password itself instead.
 */
export async function readerKeyFromProof(l: LockRef, proof: string): Promise<ReaderKey | "wrong" | "password"> {
  const lk = await lockKeyOf(db, l);
  if (!lk?.proofHash) return "password";
  return proofMatches(proof, lk.proofHash) ? { wrappedPrivateKey: lk.wrappedPrivateKey } : "wrong";
}

/** The salt a reader's browser derives the password's key with, when the lock has a key pair with a proof. */
export async function unlockSaltOf(l: LockRef) {
  const lk = await lockKeyOf(db, l);
  return lk?.proofHash ? lk.wrappedPrivateKey.split(".")[1] : null;
}

// --- Encrypting and decrypting a page ----------------------------------------------------------

/** Encrypts a tree for a page and seals its new content key to every password that opens it. */
export async function sealNewContent(tx: Tx, publicationId: string, tree: Node) {
  const ck = randomBytes(32);
  const cipher = encryptTree(ck, tree, publicationId);
  const want = locksOf(await spotsOf(tx, publicationId));
  await tx.delete(publicationKey).where(eq(publicationKey.publicationId, publicationId));
  let sealedAll = true;
  for (const l of want) {
    const lk = await lockKeyOf(tx, l);
    if (!lk) {
      sealedAll = false;
      continue;
    }
    await tx
      .insert(publicationKey)
      .values({ publicationId, scope: l.scope, targetId: l.id, sealedKey: sealContentKey(lk.publicKey, ck) });
  }
  return { cipher, needsRepublish: !sealedAll };
}

export type { SealedPage } from "./reader-crypto";

/** An encrypted page as sealed to one password, or null when it isn't (it needs a republish). */
async function sealedFor(pub: { id: string; cipher: string | null }, l: LockRef): Promise<SealedPage | null> {
  if (!pub.cipher) return null;
  const [row] = await db
    .select({ sealedKey: publicationKey.sealedKey })
    .from(publicationKey)
    .innerJoin(lockKey, and(eq(lockKey.scope, publicationKey.scope), eq(lockKey.targetId, publicationKey.targetId)))
    .where(and(eq(publicationKey.publicationId, pub.id), eq(publicationKey.scope, l.scope), eq(publicationKey.targetId, l.id)))
    .limit(1);
  return row ? { id: pub.id, cipher: pub.cipher, sealedKey: row.sealedKey } : null;
}

/** Key pairs of pages, entries, graphs and collections that no longer exist. Run after deleting any. */
export async function dropOrphanLockKeys(tx: Db) {
  await tx.execute(sql`
    delete from lock_key k where
      (k.scope = 'publication' and not exists (select 1 from publication p where p.id = k.target_id))
      or (k.scope = 'entry' and not exists (select 1 from collection_entry e where e.id = k.target_id))
      or (k.scope = 'graph' and not exists (select 1 from graph g where g.id = k.target_id))
      or (k.scope = 'collection' and not exists (select 1 from collection c where c.id = k.target_id))
  `);
  await tx.execute(sql`
    delete from publication_key pk where not exists
      (select 1 from lock_key k where k.scope = pk.scope and k.target_id = pk.target_id)
  `);
}

/**
 * Encrypted pages that just came back to their graph because a collection they were only in went
 * away. Their graph place switches to Password when it has one to use; one that can't, or whose
 * password the page isn't sealed to, shows "needs republish" there instead of the page.
 */
export async function afterReturnToGraph(tx: Tx, publicationIds: string[]) {
  if (!publicationIds.length) return;
  const encrypted = await tx.query.publication.findMany({
    where: and(inArray(publication.id, publicationIds), eq(publication.encrypted, true)),
    columns: { id: true },
  });
  for (const { id } of encrypted) {
    let [spot] = await spotsOf(tx, id);
    if (spot.access !== "password" && spot.lock) {
      await tx.update(publication).set({ access: "password" }).where(eq(publication.id, id));
      [spot] = await spotsOf(tx, id);
    }
    const sealed = spot.lock && (await pagesSealedTo(tx, spot.lock)).includes(id);
    if (!sealed) await tx.update(publication).set({ needsRepublish: true }).where(eq(publication.id, id));
  }
}

/**
 * What a reader gets for an encrypted page at one place: the page still sealed, for their browser to
 * open with the password's key, or why not. Nobody gets past the password here, members and managers
 * included: the server can't read the page, and only hands it out to readers who proved the password.
 */
export async function readEncrypted(
  pub: { id: string; cipher: string | null },
  access: "open" | "password" | "members",
  lock: VersionedLock | null,
): Promise<{ sealed: SealedPage } | { blocker: NonNullable<Blocker> }> {
  if (access !== "password" || !lock) return { blocker: { need: "password", lock: null } };
  const sealed = await sealedFor(pub, lock);
  if (!sealed) return { blocker: { need: "republish" } };
  if (!(await isUnlocked(lock))) return { blocker: { need: "password", lock, encrypted: true } };
  return { sealed };
}

/** Titles of the encrypted pages that open with this password, for its settings. */
export async function sealedPageTitles(l: LockRef) {
  const rows = await db
    .select({ title: publication.title })
    .from(publicationKey)
    .innerJoin(publication, eq(publication.id, publicationKey.publicationId))
    .where(and(eq(publicationKey.scope, l.scope), eq(publicationKey.targetId, l.id)))
    .orderBy(publication.title);
  return rows.map((r) => r.title);
}

/**
 * Whether a graph's or collection's password can encrypt pages once saved: a new one long enough,
 * or the current one when it already has a key pair (short or older passwords have none).
 */
export async function canEncryptWith(l: LockRef, newPassword: string) {
  if (newPassword) return newPassword.length >= ENCRYPT_PASSWORD_MIN;
  return !!(await lockKeyOf(db, l));
}

/**
 * Encrypts a page just created when one of its places asks for that (`encryptNewPages`) and every
 * shown place is password-protected with a key pair to seal to. Otherwise leaves it readable:
 * encrypting is never a reason to refuse a publish. True when it encrypted the page.
 */
/**
 * Why a page can't be encrypted as it's shown now, without typing a password: a shown place that
 * isn't password-protected, or a password with no key pair to seal to (set before encryption
 * existed, or too short), with the place to fix it. Undefined when it can be.
 */
export async function encryptBlocker(tx: Db, spots: Spot[]): Promise<{ reason: string; spot: Spot } | undefined> {
  const open = unprotectedSpots(spots)[0];
  if (open)
    return {
      spot: open,
      reason:
        open.access === "password"
          ? `Password with no password to use in ${open.label}`
          : `${open.access === "members" ? "Members only" : "Open"} in ${open.label}`,
    };
  for (const l of locksOf(spots))
    if (!(await lockKeyOf(tx, l))) {
      const spot = spots.find((s) => s.lock && lockId(s.lock) === lockId(l))!;
      const own = l.scope === "publication" || l.scope === "entry";
      return { spot, reason: `${own ? "Its own password" : "The password"} in ${spot.label} was set before encryption existed or is too short` };
    }
}

/** Stores a readable page encrypted with every password that opens it. Check `encryptBlocker` first. */
export async function encryptPage(tx: Tx, pub: typeof publication.$inferSelect) {
  const { cipher, needsRepublish } = await sealNewContent(tx, pub.id, pub.tree);
  await tx
    .update(publication)
    .set({
      encrypted: true,
      cipher,
      needsRepublish,
      tree: emptyTree(pub.rootUid),
      searchText: "",
      tags: [],
      contentHash: sealHash(pub.id, plainHash(pub)),
    })
    .where(eq(publication.id, pub.id));
}

/**
 * Whether a new page is encrypted, given whether its graph place (when shown) and any of its
 * collections ask for it; it also needs `encryptBlocker` to find nothing. Shared with
 * lib/e2e-publish.ts, which predicts this before the page exists.
 */
export const wantsEncryption = (graphAsks: boolean, aCollectionAsks: boolean) => graphAsks || aCollectionAsks;

export async function encryptNewPageIfWanted(publicationId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ pub: publication, g: graph })
      .from(publication)
      .innerJoin(graph, eq(graph.id, publication.graphId))
      .where(eq(publication.id, publicationId))
      .limit(1);
    if (!row || row.pub.encrypted) return false;
    const entries = await tx
      .select({ c: collection })
      .from(collectionEntry)
      .innerJoin(collection, eq(collection.id, collectionEntry.collectionId))
      .where(eq(collectionEntry.publicationId, publicationId));
    const wanted = wantsEncryption(row.pub.inGraph && row.g.encryptNewPages, entries.some(({ c }) => c.encryptNewPages));
    if (!wanted) return false;
    if (await encryptBlocker(tx, await spotsOf(tx, publicationId))) return false;
    await encryptPage(tx, row.pub);
    return true;
  });
}
