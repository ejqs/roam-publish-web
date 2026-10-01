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
  let t = s
    .replace(/```(?:[^\n`]*\n)?([\s\S]*?)```/g, "$1")
    .replace(/\$\$([\s\S]+?)\$\$/g, "$1")
    .replace(/\{\{((?:[^{}]|\{[^{}]*\})*)\}\}/g, "")
    .replace(/\(\(([\w-]{9,})\)\)/g, "");
  // Innermost first, so nested refs like [[a [[b]] c]] unwrap fully.
  for (let prev = ""; prev !== t; ) {
    prev = t;
    t = t.replace(/#?\[\[([^[\]]*)\]\]/g, "$1");
  }
  return t
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^>\s?/, "")
    .replace(/\*\*|__|\^\^|~~|`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
