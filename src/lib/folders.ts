import { slugify } from "./slug";

/**
 * Folders on a graph's or collection's front page. They're arranged on the website only (Manage ›
 * Arrange), so the extension never sends or sees them. Shared by server and client: nothing here
 * touches the database.
 */

export const MAX_FOLDERS = 100;
/** Top level counts as 1, so a folder can hold folders that hold folders, and no deeper. */
export const MAX_FOLDER_DEPTH = 3;
export const FOLDER_NAME_MAX = 60;

export type FolderRow = { id: string; name: string; parentId: string | null };
export type FolderNode<F extends FolderRow = FolderRow> = F & { depth: number; children: FolderNode<F>[] };

/** Folders as a tree, keeping their order among siblings. Folders whose parent is missing go to the top. */
export function folderTree<F extends FolderRow>(folders: F[]): FolderNode<F>[] {
  const nodes = new Map(folders.map((f) => [f.id, { ...f, depth: 1, children: [] as FolderNode<F>[] }]));
  const roots: FolderNode<F>[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    if (parent && parent !== n) parent.children.push(n);
    else roots.push(n);
  }
  const setDepth = (list: FolderNode<F>[], depth: number, seen: Set<string>) => {
    for (const n of list) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      n.depth = depth;
      setDepth(n.children, depth + 1, seen);
    }
  };
  setDepth(roots, 1, new Set());
  return roots;
}

/** Every folder in the tree, parents before children, in display order. */
export function flatten<F extends FolderRow>(tree: FolderNode<F>[]): FolderNode<F>[] {
  return tree.flatMap((n) => [n, ...flatten(n.children)]);
}

/** The folder and the folders above it, top level first. Empty when it's missing. */
export function folderChain<F extends FolderRow>(folders: F[], id: string | null): F[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const chain: F[] = [];
  for (let f = id ? byId.get(id) : undefined; f && !chain.includes(f); f = f.parentId ? byId.get(f.parentId) : undefined)
    chain.unshift(f);
  return chain;
}

/** The folder's id and every folder under it. */
export function subtreeIds(folders: FolderRow[], id: string): string[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const f of folders) if (f.parentId === out[i] && !out.includes(f.id)) out.push(f.id);
  return out;
}

/** Why a set of folders can't be saved, or undefined when it can. Used by Arrange's Save and its server action. */
export function arrangeBlocked(folders: FolderRow[]): string | undefined {
  if (folders.length > MAX_FOLDERS) return `Up to ${MAX_FOLDERS} folders.`;
  const ids = new Set(folders.map((f) => f.id));
  const seen = new Set<string>();
  for (const f of folders) {
    const name = f.name.trim();
    if (!name) return "Give every folder a name.";
    if (name.length > FOLDER_NAME_MAX) return `Folder names can be up to ${FOLDER_NAME_MAX} characters.`;
    if (f.parentId && !ids.has(f.parentId)) return "A folder is inside one that no longer exists.";
    const key = `${f.parentId ?? ""}\n${name.toLowerCase()}`;
    if (seen.has(key)) return `Two folders side by side are both called "${name}".`;
    seen.add(key);
  }
  for (const f of folders) {
    const chain = folderChain(folders, f.id);
    if (chain[0]?.parentId) return "A folder can't be inside itself.";
    if (chain.length > MAX_FOLDER_DEPTH) return `Folders can be nested ${MAX_FOLDER_DEPTH} deep at most.`;
  }
}

/** A URL slug for each folder, unique within its place, in the folders' order. */
export function folderSlugs(folders: FolderRow[]): Map<string, string> {
  const taken = new Set<string>();
  const out = new Map<string, string>();
  for (const f of folders) {
    const chain = folderChain(folders, f.id).map((c) => c.name);
    const base = slugify(chain.join(" "));
    let slug = base;
    for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;
    taken.add(slug);
    out.set(f.id, slug);
  }
  return out;
}

/** A Roam namespace title like "PyRevit/Smart-Button" split into its folders and the rest. */
export function namespaceOf(title: string): { path: string[]; rest: string } | null {
  const parts = title.split("/").map((p) => p.trim());
  if (parts.length < 2 || parts.some((p) => !p)) return null;
  // Deeper namespaces keep their extra levels in the title.
  const path = parts.slice(0, Math.min(parts.length - 1, MAX_FOLDER_DEPTH)).map((p) => p.slice(0, FOLDER_NAME_MAX));
  return { path, rest: parts.slice(path.length).join("/") };
}

/** The title to show inside a folder: "PyRevit/Smart-Button" reads "Smart-Button" in PyRevit. */
export function titleInFolder(title: string, chain: { name: string }[]) {
  if (!chain.length) return title;
  const prefix = chain.map((f) => f.name.toLowerCase()).join("/") + "/";
  const short = title.slice(prefix.length).trim();
  return title.toLowerCase().startsWith(prefix) && short ? short : title;
}

type Item = { id: string; title: string; folderId: string | null };

/**
 * Folders that loose pages' Roam namespaces ask for, added to `folders`, and where each of those
 * pages goes. Existing folders with the same name and parent are reused. Only pages not in a folder move.
 */
export function suggestFromNamespaces<F extends FolderRow>(
  folders: F[],
  items: Item[],
  newId: () => string,
  make: (row: FolderRow) => F,
): { folders: F[]; moves: Map<string, string>; created: number } {
  const out = [...folders];
  const moves = new Map<string, string>();
  let created = 0;
  const find = (name: string, parentId: string | null) =>
    out.find((f) => f.parentId === parentId && f.name.trim().toLowerCase() === name.toLowerCase());
  for (const item of items) {
    if (item.folderId) continue;
    const ns = namespaceOf(item.title);
    if (!ns) continue;
    let parentId: string | null = null;
    for (const name of ns.path) {
      let f = find(name, parentId);
      if (!f) {
        if (out.length >= MAX_FOLDERS) break;
        f = make({ id: newId(), name, parentId });
        out.push(f);
        created++;
      }
      parentId = f.id;
    }
    if (parentId) moves.set(item.id, parentId);
  }
  return { folders: out, moves, created };
}
