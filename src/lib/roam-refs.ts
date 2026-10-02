/** Roam reference syntax shared by the renderer and the tag extractor, so the two always agree. */

export type RefMatch = { index: number; length: number; groups: string[] };

/** `[[Title]]` (or `#[[Title]]`) with nested refs balanced, e.g. `[[a [[b]] c]]`. */
export const pageRef =
  (prefix: string) =>
  (s: string): RefMatch | null => {
    for (let from = 0; ; ) {
      const start = s.indexOf(`${prefix}[[`, from);
      if (start < 0) return null;
      const open = start + prefix.length;
      let depth = 0;
      for (let i = open; i < s.length - 1; i++) {
        if (s.startsWith("[[", i)) {
          depth++;
          i++;
        } else if (s.startsWith("]]", i)) {
          depth--;
          i++;
          if (depth === 0) {
            return { index: start, length: i + 1 - start, groups: [s.slice(start, i + 1), s.slice(open + 2, i - 1)] };
          }
        }
      }
      from = start + 1;
    }
  };

/** A bare `#tag`: not after a word character or `&` (so `&#39;` and `a#b` aren't tags). */
export const BARE_TAG = /(?<![\w&])#([\p{L}\p{N}_\-/]+)/u;
