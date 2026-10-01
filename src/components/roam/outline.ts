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
