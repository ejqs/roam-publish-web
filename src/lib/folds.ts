import type { Node } from "@/db/app-schema";

/**
 * The uids of collapsed blocks, embeds included, in the order the extension lists them
 * (roam-publish src/serialize.ts `foldedUids`).
 */
export function foldedUids(n: Node): string[] {
  const embeds = [n.embed, ...(n.moreEmbeds ?? [])].filter((e): e is Node => !!e);
  return [...(n.collapsed ? [n.uid] : []), ...[...n.children, ...embeds].flatMap(foldedUids)];
}
