import type { Node } from "@/db/app-schema";
import type { PageLinks } from "./markup";

/** Builds a static block for site pages written as Roam outlines (home, setup). */
export function block(string: string, children: Node[] = []): Node {
  return { uid: string, string, children };
}

/** `[[Ref]]` targets for the site's own pages. */
export const siteLinks: PageLinks = new Map([
  ["discover", "/discover"],
  ["setting it up", "/setup"],
]);

// Roam's outline geometry, in em so it scales with the text: the bullet's centre sits 0.625em in,
// text starts 1.25em right of it, each level indents 2.5em, and the thread line hangs under the parent's bullet.

/** A block row; its marker is absolutely positioned in the left gutter. */
export const rowClass = "relative pl-[1.875em]";

/** A block's children: pulled back so the left border lines up under the parent's bullet. */
export const childrenClass = "-ml-[1.25em] border-l border-roam-thread pl-[calc(1.875em_-_1px)]";

/** The bullet, centred on the first line of body text (2px padding + half a 1.6 line). */
export const bulletClass =
  "absolute top-[calc(0.8em_-_1px)] left-[calc(0.625em_-_2.5px)] size-[6px] rounded-full bg-roam-bullet";
