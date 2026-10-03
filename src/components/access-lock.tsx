import { AccessIcon } from "@/components/privacy-icon";
import type { Access } from "@/db/schema";
import { cn } from "cn";

/**
 * What a visitor runs into on something protected, as hover text for lock icons. `name` is the
 * graph or collection whose password or members apply.
 */
export function lockExplanation(access: Access, kind: "graph" | "collection", name?: string, encrypted = false) {
  const whose = name ? `${name}` : `this ${kind}`;
  if (encrypted)
    return `Encrypted with its password. Everyone is asked for the password, members of ${whose} too; unlocking lasts 30 days on that browser.`;
  if (access === "password")
    return `Password protected. Visitors who aren't members of ${whose} are asked for the password; unlocking lasts 30 days on that browser.`;
  if (access === "members")
    return `Members only. Visitors who aren't signed in are asked to sign in, and only members of ${whose} can read it.`;
  return undefined;
}

export type LockInfo = { access: Access; encrypted?: boolean; text: string };

/** The lock to show on something protected, or undefined when anyone can read it. */
export function lockInfo(access: Access, kind: "graph" | "collection", name?: string, encrypted = false): LockInfo | undefined {
  const text = lockExplanation(access, kind, name, encrypted);
  return text ? { access, encrypted, text } : undefined;
}

/** A lock that explains itself on hover or focus; nothing when open. */
export function AccessLock({
  access,
  what,
  name,
  className = "size-7",
}: {
  access: Access;
  what: "graph" | "collection";
  name?: string;
  /** Icon size. */
  className?: string;
}) {
  const lock = lockInfo(access, what, name);
  if (!lock) return null;
  return <LockHint lock={lock} className={className} />;
}

/** The icon for who can read it (components/privacy-icons.ts), with its explanation as hover text. */
export function LockHint({ lock, className }: { lock: LockInfo; className?: string }) {
  return (
    <span
      title={lock.text}
      tabIndex={0}
      className="inline-flex shrink-0 cursor-help items-center align-middle text-muted-foreground outline-none focus-visible:text-foreground"
    >
      <AccessIcon access={lock.access} encrypted={lock.encrypted} className={cn("size-3.5", className)} />
      <span className="sr-only">{lock.text}</span>
    </span>
  );
}
