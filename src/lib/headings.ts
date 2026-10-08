import type { Node } from "@/db/app-schema";
import { blockComponent } from "@/components/roam/markup";
import { plainText } from "@/lib/slug";

export type Heading = { id: string; text: string; level: 1 | 2 | 3 };

/** The element id a published heading block gets, for links from the page outline. */
export const headingId = (uid: string) => `h-${uid}`;

/**
 * A page's heading blocks in reading order, for its outline. Embedded blocks are left out, and so are the
 * children of tables, boards and diagrams, which aren't drawn as blocks.
 */
export function headingsOf(nodes: Node[]): Heading[] {
  return nodes.flatMap((n) => {
    const text = n.heading ? plainText(n.string).trim() : "";
    const own = text ? [{ id: headingId(n.uid), text, level: n.heading! }] : [];
    return [...own, ...(blockComponent(n.string) ? [] : headingsOf(n.children))];
  });
}

/** The block with this uid and the blocks above it, top first; null when it isn't on the page. Embeds aren't searched. */
export function zoomPath(nodes: Node[], uid: string): Node[] | null {
  for (const n of nodes) {
    if (n.uid === uid) return [n];
    const below = zoomPath(n.children, uid);
    if (below) return [n, ...below];
  }
  return null;
}
