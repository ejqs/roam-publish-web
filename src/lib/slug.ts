export function slugify(input: string) {
  const s = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s || "untitled";
}

/** Strip common Roam markup for titles derived from block text. */
export function plainText(s: string) {
  return s
    .replace(/\(\(([^)]+)\)\)/g, "")
    .replace(/#?\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|\^\^|~~|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
