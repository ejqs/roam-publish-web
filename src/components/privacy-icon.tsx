import type { Access } from "@/db/schema";
import { PRIVACY_ICONS, type PrivacyKind } from "./privacy-icons";

/** A privacy state's icon (components/privacy-icons.ts). Decorative: its label sits next to it. */
export function PrivacyIcon({ kind, className }: { kind: PrivacyKind; className?: string }) {
  const Icon = PRIVACY_ICONS[kind];
  return <Icon className={className} aria-hidden />;
}

/** The icon for who can read something; nothing when anyone can. */
export function AccessIcon({ access, encrypted, className }: { access: Access; encrypted?: boolean; className?: string }) {
  if (access === "open") return null;
  return <PrivacyIcon kind={encrypted ? "encrypted" : access} className={className} />;
}
