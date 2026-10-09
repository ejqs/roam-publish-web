"use client";

import { useEffect, useState } from "react";
import type { Lock } from "@/lib/gates";
import { openTitle, type SealedTitle } from "@/lib/reader-crypto";
import { loadReaderKey, READER_KEY_SAVED } from "@/lib/reader-keys";
import { plainText } from "@/lib/slug";

/** An encrypted page's title, sealed to the password it opens with where it's listed. */
export type ListedSealedTitle = { page: SealedTitle; lock: Lock };

/**
 * An encrypted page's title, opened in the reader's browser when it keeps that password's key
 * (lib/reader-keys.ts); until then, and without one, `fallback` ("Encrypted page"). The server only has
 * the title sealed.
 */
export function SealedTitleText({ sealed, fallback }: { sealed: ListedSealedTitle; fallback: string }) {
  const [title, setTitle] = useState<string | null>(null);
  const { page, lock } = sealed;
  const { scope, id, version } = lock;

  useEffect(() => {
    let live = true;
    const open = async () => {
      const key = await loadReaderKey({ scope, id }, version);
      const t = key && (await openTitle(page, key).catch(() => null));
      if (live && t) setTitle(t);
    };
    open();
    window.addEventListener(READER_KEY_SAVED, open);
    return () => {
      live = false;
      window.removeEventListener(READER_KEY_SAVED, open);
    };
  }, [page, scope, id, version]);

  return <>{plainText(title ?? fallback) || "Untitled"}</>;
}

/** A listed page's title: opened in the browser when it's encrypted (`sealed`), as it is otherwise. */
export function ListTitle({ title, sealed }: { title: string; sealed?: ListedSealedTitle }) {
  return sealed ? <SealedTitleText sealed={sealed} fallback={title} /> : <>{plainText(title) || "Untitled"}</>;
}
