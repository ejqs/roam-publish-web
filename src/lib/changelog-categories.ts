/** Kinds of change in the roam.pub change log. Kept apart from lib/changelog.ts so the settings form can use it. */
export const CHANGE_CATEGORIES = ["publishing", "access", "listing", "collections", "tags", "moderation"] as const;
export type ChangeCategory = (typeof CHANGE_CATEGORIES)[number];

/** The kinds an owner can leave out of Roam, in settings order. Moderation always reaches Roam. */
export const OPTIONAL_CATEGORIES = [
  { id: "publishing", label: "Publishing", description: "Published, republished, unpublished, byline" },
  { id: "access", label: "Who can read", description: "Access, passwords, encryption" },
  { id: "listing", label: "Where it's listed", description: "Unlisted, public, Discover; shown or hidden in the graph" },
  { id: "collections", label: "Collections", description: "Added to or removed from a collection" },
  { id: "tags", label: "Tags", description: "Tags changed on the website" },
] as const satisfies readonly { id: Exclude<ChangeCategory, "moderation">; label: string; description: string }[];
export type OptionalCategory = (typeof OPTIONAL_CATEGORIES)[number]["id"];
