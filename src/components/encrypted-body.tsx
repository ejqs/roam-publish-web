"use client";

import { useEffect, useMemo, useState } from "react";
import { EncryptedGate } from "@/components/encrypted-gate";
import { type BodyProps, PublicationBody } from "@/components/publication-body";
import { PageLinks } from "@/components/roam/markup";
import type { Node } from "@/db/app-schema";
import type { Lock } from "@/lib/gates";
import { openPage, type SealedPage } from "@/lib/reader-crypto";
import { loadReaderKey, READER_KEY_SAVED } from "@/lib/reader-keys";
import { collectionTagPath, graphTagPath } from "@/lib/tag-paths";

/** Where a page's #tags lead: its graph's or its collection's front page, filtered to the tag. */
export type TagBase = { graph: string } | { collection: string } | null;

const tagHrefFor = (base: TagBase | undefined) =>
  !base ? undefined : "graph" in base ? (t: string) => graphTagPath(base.graph, t) : (t: string) => collectionTagPath(base.collection, t);

/**
 * An encrypted page's body, opened in the reader's browser with the password's key kept there
 * (lib/reader-keys.ts). The server only ever sent it sealed. Without a key here, asks for the password
 * again, and opens as soon as it's typed.
 */
export function EncryptedBody({
  page,
  lock,
  members,
  body,
  links,
  tagBase,
}: {
  page: SealedPage;
  lock: Lock;
  members?: string;
  body: BodyProps;
  /** The page links, as title → href pairs. */
  links: [string, string][];
  tagBase?: TagBase;
}) {
  const [state, setState] = useState<{ tree: Node } | "opening" | "needKey">("opening");
  const { scope, id, version } = lock;

  useEffect(() => {
    let live = true;
    const open = async () => {
      const key = await loadReaderKey({ scope, id }, version);
      const tree = key && (await openPage(page, key).catch(() => null));
      if (live) setState(tree ? { tree } : "needKey");
    };
    open();
    window.addEventListener(READER_KEY_SAVED, open);
    return () => {
      live = false;
      window.removeEventListener(READER_KEY_SAVED, open);
    };
  }, [page, scope, id, version]);

  const pageLinks = useMemo(() => new PageLinks(links, tagHrefFor(tagBase)), [links, tagBase]);

  if (state === "needKey")
    return (
      <div className="py-8">
        <EncryptedGate lock={lock} what="page" members={members} again />
      </div>
    );
  if (state === "opening")
    return (
      <div aria-busy className="py-8">
        <h1 className="mb-4 text-[32px] sm:text-[42px] leading-tight font-semibold break-words">{body.title}</h1>
        <p className="text-sm text-muted-foreground">Decrypting in your browser…</p>
      </div>
    );
  return <PublicationBody {...body} tree={state.tree} links={pageLinks} />;
}
