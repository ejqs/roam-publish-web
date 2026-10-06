import { z } from "zod";

/**
 * Names a graph can't take: roam.pub's own routes would shadow /{graph} and /dashboard/{graph}, so its
 * front page could never be opened. tests/unit/graph-names.test.ts checks every top-level route is here;
 * the rest are kept free for pages roam.pub may add. Lowercase; matched case-insensitively.
 */
export const RESERVED_GRAPH_NAMES = new Set([
  "_next", "about", "admin", "api", "blog", "c", "collection", "collections", "costs", "dashboard", "discover",
  "feed", "forgot-password", "help", "invites", "keys", "login", "logout", "new", "onboarding", "p", "privacy",
  "report", "reset-password", "search", "settings", "setup", "signup", "static", "support", "terms", "u",
  "unlock", "updates", "verify-email", "www",
]);

export const isReservedGraphName = (name: string) => RESERVED_GRAPH_NAMES.has(name.trim().toLowerCase());

const reservedMessage = (name: string) =>
  `"${name.trim()}" is the name of a roam.pub page, so a graph with that name can't be published here.`;

export const GraphName = z
  .string()
  .trim()
  .min(1, "Enter your graph name")
  .max(200)
  .regex(/^[A-Za-z0-9_-]+$/, "Graph names only contain letters, numbers, - and _")
  .superRefine((n, ctx) => {
    if (isReservedGraphName(n)) ctx.addIssue({ code: "custom", message: reservedMessage(n) });
  });

/** For the form, as the user types: nothing for an empty field, else the first problem with the name. */
export function graphNameError(name: string): string | null {
  if (!name.trim()) return null;
  const r = GraphName.safeParse(name);
  return r.success ? null : r.error.issues[0].message;
}
