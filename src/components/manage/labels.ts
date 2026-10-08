/** Access wording shared by server and client components (so not in a "use client" file). */

/** Short names, for badges. Forms use readOptions, which says whose members. */
export const ACCESS_LABELS = { open: "Open", password: "Password", members: "Members only" } as const;
export const ACCESS_DESCRIPTIONS = {
  open: "Anyone with the link can read.",
  password: "Readers enter a password. Unlocking lasts 30 days on that browser.",
  members: "Only signed-in members can read.",
} as const;

/** Where a page is listed, the same words for graphs and collections. */
export const LISTING_LABELS = { unlisted: "Unlisted", listed: "Public", discover: "Discover" } as const;

/**
 * Who can see a page in one place, as one choice: a ladder from most open to most closed. Stored as
 * who can read it (access) and where it's listed (listing); a protected page that's listed shows its
 * title on the front page. Protected pages are never on Discover, so that pair can't be chosen.
 */
export const RUNGS = ["discover", "public", "unlisted", "password", "members"] as const;
export type Rung = (typeof RUNGS)[number];
export const RUNG_LABELS: Record<Rung, string> = {
  discover: "Discover",
  public: "Public",
  unlisted: "Unlisted",
  password: "Password",
  members: "Members",
};

export function rungOf(access: "open" | "password" | "members", listing: "unlisted" | "listed" | "discover"): Rung {
  if (access !== "open") return access;
  return listing === "listed" ? "public" : listing;
}

/** What a rung means for a page in `place` ("notes", "Reading list"), the same words everywhere. */
export function rungDescription(r: Rung, place: string, kind: "graph" | "collection"): string {
  const front = kind === "graph" ? `the ${place} front page` : `${place}'s page`;
  return {
    discover: `Public, and also on roam.pub/discover.`,
    public: `Anyone can read it. Listed on ${front} and in roam.pub search, and [[links]] on other pages lead here.`,
    unlisted: "Anyone with the link can read it. Not listed anywhere, and [[links]] to it from other pages show as plain text.",
    password: "Readers enter the password.",
    members: `Only people invited to ${place}, signed in.`,
  }[r];
}

/** The checkbox under Password and Members: a protected page can still show its title where it's listed. */
export const showTitleLabel = (place: string, kind: "graph" | "collection") =>
  kind === "graph" ? `Show its title on the ${place} front page` : `Show its title on ${place}'s page`;

/**
 * Added after "Listed" ("Listed (Not Searchable)") when its owner took the page out of roam.pub search.
 * Only for plain Listed: Discoverable pages are always searchable.
 */
export const notSearchable = (listed: boolean, searchable: boolean) => (listed && !searchable ? " (Not Searchable)" : "");

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

/** The ladder's steps as the dashboard counts them, top first ("listed" is Public). */
export const RUNG_LEVELS = ["discover", "listed", "unlisted", "password", "members"] as const;
