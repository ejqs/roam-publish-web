import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { collection, graph, publication, publicationKey } from "@/db/schema";
import { defaultCollectionsFor } from "./places";
import { encryptBlocker, type LockRef, locksOf, lockKeyOf, type Spot, spotsOf, wantsEncryption } from "./encryption";

/**
 * Publishing encrypted in Roam (extension 0.2.0 and later). Before sending a page, the extension asks
 * `sealPlan` whether it's encrypted and which passwords' public keys to seal its content key to; it
 * encrypts the tree there and sends only the cipher and the sealed keys, so roam.pub never sees the
 * text. Older extensions still send the plain tree, which the server encrypts itself
 * (`sealNewContent`), and so does 0.2.0 where Roam lacks X25519; that path goes once every extension in
 * use is new enough and can encrypt (EXT_NEEDS_SEAL; CLAUDE.md, Extension compatibility).
 */

/** A password to seal to, with its public key (SPKI DER, base64url); null when it has no key pair. */
export type SealTarget = LockRef & { publicKey: string | null };

export type SealPlan =
  | { encrypt: false }
  /** `publicationId` is the page's id, which the tree's encryption is bound to; a new page gets it on publish. */
  | { encrypt: true; publicationId: string; locks: SealTarget[] };

/** What the extension sends instead of a tree. */
export type SealedContent = {
  publicationId: string;
  cipher: string;
  keys: (LockRef & { publicKey: string; sealedKey: string })[];
};

async function targetsOf(spots: Spot[]): Promise<SealTarget[]> {
  return Promise.all(
    locksOf(spots).map(async (l) => ({ scope: l.scope, id: l.id, publicKey: (await lockKeyOf(db, l))?.publicKey ?? null })),
  );
}

/**
 * Where a page about to be published for the first time would be shown, as `spotsOf` would see it
 * after the POST creates it, and whether it would be encrypted (`encryptNewPageIfWanted`).
 */
async function newPageSpots(graphId: string, userId: string) {
  const g = (await db.query.graph.findFirst({ where: eq(graph.id, graphId) }))!;
  const joining = await defaultCollectionsFor(graphId, userId);
  const inGraph = (g.newPagesInGraph && !joining.some((c) => c.leavesGraph)) || joining.length === 0;
  const cs = joining.length
    ? await db.query.collection.findMany({ where: inArray(collection.id, joining.map((c) => c.id)), orderBy: collection.name })
    : [];
  const spots: Spot[] = [
    {
      kind: "graph",
      label: g.name,
      access: g.defaultAccess,
      lock: g.passwordHash ? { scope: "graph", id: g.id, version: g.passwordVersion } : null,
      shown: inGraph,
      path: "",
    },
    ...cs.map((c): Spot => ({
      kind: "entry",
      label: c.name,
      access: c.defaultAccess,
      lock: c.passwordHash ? { scope: "collection", id: c.id, version: c.passwordVersion } : null,
      shown: true,
      path: "",
    })),
  ];
  const wanted = wantsEncryption(inGraph && g.encryptNewPages, cs.some((c) => c.encryptNewPages));
  return { spots, encrypt: wanted && !(await encryptBlocker(db, spots)) };
}

/** Whether the page at `rootUid` is (or, new, will be) encrypted, and what to seal it to. */
export async function sealPlan(graphId: string, userId: string, rootUid: string, newId = crypto.randomUUID()): Promise<SealPlan> {
  const existing = await db.query.publication.findFirst({
    where: and(eq(publication.graphId, graphId), eq(publication.rootUid, rootUid)),
    columns: { id: true, encrypted: true },
  });
  if (existing) {
    if (!existing.encrypted) return { encrypt: false };
    return { encrypt: true, publicationId: existing.id, locks: await targetsOf(await spotsOf(db, existing.id)) };
  }
  const { spots, encrypt } = await newPageSpots(graphId, userId);
  return encrypt ? { encrypt: true, publicationId: newId, locks: await targetsOf(spots) } : { encrypt: false };
}

const lockName = (l: LockRef) => `${l.scope}:${l.id}`;

/**
 * Whether the keys sent are sealed to exactly the passwords the plan names now, each to its current
 * public key. Not when a place or password changed while the extension was encrypting: it asks again.
 */
export function sealsMatch(plan: SealPlan, sent: SealedContent) {
  if (!plan.encrypt || plan.publicationId !== sent.publicationId) return false;
  const want = new Map(plan.locks.filter((l) => l.publicKey).map((l) => [lockName(l), l.publicKey]));
  const got = new Map(sent.keys.map((k) => [lockName(k), k.publicKey]));
  return want.size === got.size && [...want].every(([k, pk]) => got.get(k) === pk);
}

/** Stores the sealed keys sent for a page, replacing its old ones. True when a password couldn't be sealed to. */
export async function storeSealedKeys(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], plan: SealPlan & { encrypt: true }, sent: SealedContent) {
  await tx.delete(publicationKey).where(eq(publicationKey.publicationId, sent.publicationId));
  for (const k of sent.keys)
    await tx.insert(publicationKey).values({ publicationId: sent.publicationId, scope: k.scope, targetId: k.id, sealedKey: k.sealedKey });
  return plan.locks.some((l) => !l.publicKey);
}
