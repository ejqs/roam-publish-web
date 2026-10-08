
/**
 * Passwords' private keys in this browser's IndexedDB, as non-extractable CryptoKeys: pages on this
 * site can open encrypted pages with them but never read the key itself out. Kept 30 days, like the
 * unlock, and filed under the password's version so a changed password asks again.
 */

export type KeyLock = { scope: "graph" | "collection" | "publication" | "entry"; id: string };

const DB = "roam-publish-keys";
const STORE = "keys";
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

type Saved = { lock: string; version: number; key: CryptoKey; savedAt: number };

const lockName = (l: KeyLock) => `${l.scope}:${l.id}`;

/** Also kept in memory, for browsers that refuse IndexedDB (private windows): good until the tab closes. */
const memory = new Map<string, Saved>();

/** Fired on window when a key is saved, so a page waiting for one can open. */
export const READER_KEY_SAVED = "roam-publish:reader-key-saved";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "lock" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Keeps a password's private key on this browser, replacing any kept for an older version. */
export async function saveReaderKey(l: KeyLock, version: number, key: CryptoKey) {
  const row: Saved = { lock: lockName(l), version, key, savedAt: Date.now() };
  memory.set(row.lock, row);
  await run("readwrite", (s) => s.put(row)).catch(() => {});
  globalThis.window?.dispatchEvent(new Event(READER_KEY_SAVED));
}

/** Forgets every key kept on this browser. */
export async function clearReaderKeys() {
  memory.clear();
  await run("readwrite", (s) => s.clear()).catch(() => {});
}

/** The password's private key kept on this browser, if it's for this version and not expired. */
export async function loadReaderKey(l: KeyLock, version: number): Promise<CryptoKey | null> {
  try {
    const row = memory.get(lockName(l)) ?? ((await run("readonly", (s) => s.get(lockName(l)))) as Saved | undefined);
    if (!row || row.version !== version || Date.now() - row.savedAt > KEEP_MS) return null;
    return row.key;
  } catch {
    // Private windows and blocked storage: the reader types the password each visit.
    return null;
  }
}
