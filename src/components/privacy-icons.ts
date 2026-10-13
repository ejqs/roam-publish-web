import { CompassIcon, EyeOffIcon, GlobeIcon, LockIcon, SearchXIcon, UsersIcon } from "lucide-react";
import { EncryptedIcon } from "@/components/encrypted-icon";
import { ACCESS_LABELS, LISTING_LABELS } from "@/components/manage/labels";
import type { Access } from "@/db/schema";

/**
 * One icon per privacy state, everywhere a page's privacy shows: the dashboard's controls and
 * badges, list rows, the unlock screen and the title of a published page. A password is a lock; encryption
 * is the lock with an E beside it.
 */
export const PRIVACY_ICONS = {
  public: GlobeIcon,
  discover: CompassIcon,
  unlisted: EyeOffIcon,
  password: LockIcon,
  encrypted: EncryptedIcon,
  members: UsersIcon,
  unsearchable: SearchXIcon,
} as const;

export type PrivacyKind = keyof typeof PRIVACY_ICONS;

export type PrivacyNote = {
  kind: PrivacyKind;
  label: string;
  text: string;
  /** Shown after the label in the popover's title, smaller: the encryption version ("v2"). */
  tag?: string;
  href?: string;
  /** The link's words; "How it works" by default. */
  linkLabel?: string;
};

/**
 * What a reader is told about a page they're reading: whether it's protected, where it's listed
 * (Public, Discover or Unlisted), and whether it's kept out of site search. `container` is the
 * graph or collection it's shown in.
 */
export function privacyNotes({
  access,
  encrypted,
  encryption,
  listing,
  showListing = true,
  unsearchable = false,
  container,
}: {
  access: Access;
  encrypted: boolean;
  /** How it was encrypted (lib/encryption-rules.ts ENCRYPTION_VERSIONS), and the code that did it. */
  encryption?: { version: number | null; by: string | null };
  /** Where it's listed; "discover" only when it's actually on Discover (lib/discover.ts). */
  listing: "unlisted" | "listed" | "discover";
  /** The graph's or collection's "Show Public and Discover labels" setting. */
  showListing?: boolean;
  /**
   * Listed here, and its owner took it out of roam.pub search. Unlisted already says it can't be found, and a
   * password or members-only page is never searchable, so neither shows it.
   */
  unsearchable?: boolean;
  container: string;
}): PrivacyNote[] {
  const notes: PrivacyNote[] = [];
  const unlisted = listing === "unlisted";
  // Only an open page is Public or on Discover; a protected page's lock says more than where its title is listed.
  if (showListing && access === "open" && !encrypted && !unlisted)
    notes.push(
      listing === "discover"
        ? {
            kind: "discover",
            label: LISTING_LABELS.discover,
            text: `Anyone can read it. It's listed on ${container} and on roam.pub/discover.`,
            href: "/discover",
            linkLabel: "Open Discover",
          }
        : { kind: "public", label: LISTING_LABELS.listed, text: `Anyone can read it. It's listed on ${container}.` },
    );
  if (encrypted) {
    const v = encryption?.version ?? 1;
    const by = encryption?.by ? ` by ${encryption.by}` : "";
    notes.push({
      kind: "encrypted",
      label: v >= 2 ? "End-to-end encrypted" : "Encrypted",
      tag: `v${v}`,
      text:
        v >= 2
          ? `Encrypted in Roam${by} before it was published, so roam.pub never saw its text. Your browser decrypts it once you unlock it.`
          : `Encrypted${by || " by roam.pub"} when it was published, so a copy of the database can't be read, but roam.pub saw its text then. Your browser decrypts it once you unlock it.`,
      href: `/privacy/encryption/versions#v${v}`,
      linkLabel: "Learn more",
    });
  }
  else if (access === "password")
    notes.push({ kind: "password", label: ACCESS_LABELS.password, text: "Readers need the password. Unlocking lasts 30 days on a browser." });
  else if (access === "members")
    notes.push({ kind: "members", label: ACCESS_LABELS.members, text: `Only members of ${container} can read it, once signed in.` });
  if (unlisted)
    notes.push({
      kind: "unlisted",
      label: LISTING_LABELS.unlisted,
      // Unlisted pages can hide their graph from readers, so this doesn't name it.
      text: "Only people with the link can find it. It isn't on a front page, in search engines or on Discover, and links on other pages don't lead here.",
    });
  // A protected page is never in site search, so saying so again only adds noise.
  else if (unsearchable && access === "open" && !encrypted)
    notes.push({
      kind: "unsearchable",
      label: "Not Searchable",
      text: `Its owner keeps it out of roam.pub search. It's still listed on ${container}.`,
    });
  return notes;
}
