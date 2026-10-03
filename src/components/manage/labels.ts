/** Access wording shared by server and client components (so not in a "use client" file). */

/** Short names, for badges. Forms use readOptions, which says whose members. */
export const ACCESS_LABELS = { open: "Open", password: "Password", members: "Members only" } as const;
export const ACCESS_DESCRIPTIONS = {
  open: "Anyone with the link can read.",
  password: "Readers enter a password. Unlocking lasts 30 days on that browser.",
  members: "Only signed-in members can read.",
} as const;

/** Where a page is listed, the same words for graphs and collections. */
export const LISTING_LABELS = { unlisted: "Unlisted", listed: "Listed", discover: "Discoverable" } as const;

/**
 * Who can read: a page ("Anyone with the link") or a front page ("Anyone"), with members named
 * after the graph or collection they belong to.
 */
export function readOptions(
  container: string,
  what: "page" | "front page" = "page",
): { value: "open" | "password" | "members"; label: string; description: string }[] {
  return [
    {
      value: "open",
      label: what === "page" ? "Anyone with the link" : "Anyone",
      description: what === "page" ? "No sign-in or password needed." : "Anyone can open it.",
    },
    { value: "password", label: "Password", description: ACCESS_DESCRIPTIONS.password },
    {
      value: "members",
      label: `Members of ${container}`,
      description: `Only people invited to publish to ${container}, once signed in.`,
    },
  ];
}
