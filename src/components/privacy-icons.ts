import { EyeOffIcon, LockIcon, UsersIcon } from "lucide-react";
import { LockEIcon } from "@/components/lock-e-icon";
import { ACCESS_LABELS, LISTING_LABELS } from "@/components/manage/labels";
import type { Access } from "@/db/schema";

/**
 * One icon per privacy state, everywhere a page's privacy shows: the dashboard's controls and
 * badges, list rows, the unlock screen and the title of a published page. A password is a lock; encryption
 * adds an E to it.
 */
export const PRIVACY_ICONS = {
  unlisted: EyeOffIcon,
  password: LockIcon,
  encrypted: LockEIcon,
  members: UsersIcon,
} as const;

export type PrivacyKind = keyof typeof PRIVACY_ICONS;

export type PrivacyNote = { kind: PrivacyKind; label: string; text: string; href?: string };

/**
 * What a reader is told about a page they're reading: whether it's protected, and whether it's
 * listed. Nothing for an open, listed page. `container` is the graph or collection it's shown in.
 */
export function privacyNotes({
  access,
  encrypted,
  unlisted,
  container,
}: {
  access: Access;
  encrypted: boolean;
  unlisted: boolean;
  container: string;
}): PrivacyNote[] {
  const notes: PrivacyNote[] = [];
  if (encrypted)
    notes.push({
      kind: "encrypted",
      label: "Encrypted",
      text: "Stored encrypted with its password, so a copy of the database can't be read. roam.pub decrypts it for readers who unlock it.",
      href: "/privacy/encryption",
    });
  else if (access === "password")
    notes.push({ kind: "password", label: ACCESS_LABELS.password, text: "Readers need the password. Unlocking lasts 30 days on a browser." });
  else if (access === "members")
    notes.push({ kind: "members", label: ACCESS_LABELS.members, text: `Only members of ${container} can read it, once signed in.` });
  if (unlisted)
    notes.push({
      kind: "unlisted",
      label: LISTING_LABELS.unlisted,
      // Unlisted pages can hide their graph from readers, so this doesn't name it.
      text: "Only people with the link can find it. It isn't on a front page, in search engines or on Discover.",
    });
  return notes;
}
