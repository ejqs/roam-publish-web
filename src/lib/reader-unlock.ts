import { passwordKey, saltOf, unlockProof, unwrapPrivateKey } from "@/lib/reader-crypto";
import { type KeyLock, saveReaderKey } from "@/lib/reader-keys";
import { type UnlockResult, unlock, unlockSalt, unlockWithProof } from "@/server/actions/unlock";

/**
 * Unlocks in this browser. A password with a key pair is never sent: the browser derives its key,
 * sends a proof made from it, and keeps the private key that comes back to open encrypted pages.
 * Other passwords (short, or set before proofs existed) are sent once to be checked.
 */
export async function unlockHere({ password, ...lock }: KeyLock & { password: string }): Promise<UnlockResult> {
  const { salt } = await unlockSalt(lock);
  let kek = salt ? await passwordKey(password, salt) : null;
  let res = kek ? await unlockWithProof({ ...lock, proof: await unlockProof(kek) }) : null;
  if (!res || res.needPassword) {
    res = await unlock({ ...lock, password });
    kek = res.ok && res.key ? await passwordKey(password, saltOf(res.key.wrappedPrivateKey)) : null;
  }
  if (res.ok && res.key && kek && res.version !== undefined) {
    const key = await unwrapPrivateKey(res.key.wrappedPrivateKey, kek);
    if (key) await saveReaderKey(lock, res.version, key);
  }
  return res;
}

