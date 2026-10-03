import { isValidElement, type ReactNode } from "react";

/** Every element in a server component's output whose type is `type`, without rendering it. */
export function findElements(node: ReactNode, type: unknown): { props: Record<string, unknown> }[] {
  const out: { props: Record<string, unknown> }[] = [];
  const walk = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!isValidElement(n)) return;
    const el = n as unknown as { type: unknown; props: Record<string, unknown> };
    if (el.type === type) out.push(el);
    walk(el.props.children);
  };
  walk(node);
  return out;
}

/** All text in a server component's output that was already resolved (strings in props and children). */
export function textOf(node: unknown, seen = new Set<object>()): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node !== "object" || seen.has(node)) return "";
  seen.add(node);
  if (Array.isArray(node)) return node.map((n) => textOf(n, seen)).join(" ");
  // Skip React's bookkeeping (_owner, _store…), which can point back up the tree.
  return Object.entries(node)
    .filter(([k]) => !k.startsWith("_"))
    .map(([, v]) => textOf(v, seen))
    .join(" ");
}

/** Runs the first nested (async) server component named `name` in the output and returns what it renders. */
export async function renderNested(node: unknown, name: string): Promise<unknown> {
  const found: { type: (p: unknown) => unknown; props: unknown }[] = [];
  const walk = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!isValidElement(n)) return;
    const el = n as unknown as { type: unknown; props: Record<string, unknown> };
    if (typeof el.type === "function" && el.type.name === name) found.push(el as never);
    walk(el.props.children);
  };
  walk(node);
  if (!found[0]) throw new Error(`No <${name}> in the output`);
  return found[0].type(found[0].props);
}
