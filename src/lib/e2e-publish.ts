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

export type SealPlan = (
  | { encrypt: false }
  /** `publicationId` is the page's id, which the tree's encryption is bound to; a new page gets it on publish. */
  | { encrypt: true; publicationId: string; locks: SealTarget[] }
) & {
  /**
   * Asked for "Publish with encryption" (`encrypt: true`): why a new page can't be, in words, or null
   * when it can. Present only when asked, so the extension can tell a roam.pub that knows the option.
   */
  encryptBlocked?: string | null;
};

/** Why "Publish with encryption" can't put a new page in its graph as a Password page. */
export const NO_GRAPH_PASSWORD =
  "To publish with encryption, first set a graph password in your graph's Sharing settings on roam.pub. Encrypted pages open with it.";
export const GRAPH_PASSWORD_CANT_ENCRYPT =
  "Your graph password can't encrypt pages yet: it was set before encryption existed, or is shorter than 10 characters. Type it again (or a new one) in your graph's Sharing settings on roam.pub, then publish with encryption.";

/** What the extension sends instead of a tree. */
export type SealedContent = {
  publicationId: string;
  cipher: string;
  /** Its title, under the same content key (lib/encryption.ts `encryptTitle`); from extension 0.2.0. */
  titleCipher?: string;
  keys: (LockRef & { publicKey: string; sealedKey: string })[];
};

async function targetsOf(spots: Spot[]): Promise<SealTarget[]> {
  return Promise.all(
    locksOf(spots).map(async (l) => ({ scope: l.scope, id: l.id, publicKey: (await lockKeyOf(db, l))?.publicKey ?? null })),
  );
}

/**
 * Where a page about to be published for the first time goes, as `spotsOf` would see it after the
 * POST creates it, and whether it's encrypted (`encryptNewPageIfWanted`). It goes where the graph's
 * "New pages go to" setting says, leaving the graph when a collection it joins takes its pages out of
 * it; if that leaves it nowhere, it stays in the graph. A collection that encrypts its pages also
 * keeps them out of a graph place that can't be encrypted (open, members only, or a password without
 * a key pair): shown there too, the page couldn't be encrypted at all, so anyone with its graph link
 * could read what the collection was set to keep end-to-end encrypted.
 */
export async function newPagePlacement(graphId: string, userId: string, { encrypt = false } = {}) {
  const g = (await db.query.graph.findFirst({ where: eq(graph.id, graphId) }))!;
  if (encrypt) {
    // "Publish with encryption": only in the graph, as a Password page, whatever new pages usually do.
    const spots: Spot[] = [
      {
        kind: "graph",
        label: g.name,
        access: "password",
        lock: g.passwordHash ? { scope: "graph", id: g.id, version: g.passwordVersion } : null,
        shown: true,
        path: "",
      },
    ];
    const blocked = !g.passwordHash ? NO_GRAPH_PASSWORD : (await encryptBlocker(db, spots)) ? GRAPH_PASSWORD_CANT_ENCRYPT : null;
    return { graph: g, collections: [] as string[], inGraph: true, access: "password" as const, spots, encrypt: !blocked, blocked };
  }
  const joining = await defaultCollectionsFor(graphId, userId);
  const cs = joining.length
    ? await db.query.collection.findMany({ where: inArray(collection.id, joining.map((c) => c.id)), orderBy: collection.name })
    : [];
  const graphSpot = (shown: boolean): Spot => ({
    kind: "graph",
    label: g.name,
    access: g.defaultAccess,
    lock: g.passwordHash ? { scope: "graph", id: g.id, version: g.passwordVersion } : null,
    shown,
    path: "",
  });
  const entries = cs.map((c): Spot => ({
    kind: "entry",
    label: c.name,
    access: c.defaultAccess,
    lock: c.passwordHash ? { scope: "collection", id: c.id, version: c.passwordVersion } : null,
    shown: true,
    path: "",
  }));
  const encryptsHere = cs.some((c) => c.encryptNewPages);
  let inGraph = (g.newPagesInGraph && !joining.some((c) => c.leavesGraph)) || joining.length === 0;
  if (inGraph && encryptsHere && joining.length) {
    const blocked = await encryptBlocker(db, [graphSpot(true), ...entries]);
    if (blocked?.spot.kind === "graph" && !(await encryptBlocker(db, [graphSpot(false), ...entries]))) inGraph = false;
  }
  const spots = [graphSpot(inGraph), ...entries];
  const wanted = wantsEncryption(inGraph && g.encryptNewPages, encryptsHere);
  return {
    graph: g,
    collections: cs.map((c) => c.id),
    inGraph,
    access: g.defaultAccess,
    spots,
    encrypt: wanted && !(await encryptBlocker(db, spots)),
    blocked: null,
  };
}

/**
 * Whether the page at `rootUid` is (or, new, will be) encrypted, and what to seal it to. `encrypt`:
 * the extension's "Publish with encryption", which only changes where a new page goes.
 */
export async function sealPlan(
  graphId: string,
  userId: string,
  rootUid: string,
  newId = crypto.randomUUID(),
  { encrypt = false } = {},
): Promise<SealPlan> {
  const existing = await db.query.publication.findFirst({
    where: and(eq(publication.graphId, graphId), eq(publication.rootUid, rootUid)),
    columns: { id: true, encrypted: true },
  });
  const asked = encrypt ? { encryptBlocked: null } : {};
  if (existing) {
    if (!existing.encrypted) return { encrypt: false, ...asked };
    return { encrypt: true, publicationId: existing.id, locks: await targetsOf(await spotsOf(db, existing.id)), ...asked };
  }
  const { spots, encrypt: will, blocked } = await newPagePlacement(graphId, userId, { encrypt });
  if (encrypt && blocked) return { encrypt: false, encryptBlocked: blocked };
  return will ? { encrypt: true, publicationId: newId, locks: await targetsOf(spots), ...asked } : { encrypt: false, ...asked };
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
