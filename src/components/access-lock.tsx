import { LockIcon } from "lucide-react";
import type { Access } from "@/db/schema";
import { cn } from "cn";

/**
 * What a visitor runs into on something protected, as hover text for lock icons. `name` is the
 * graph or collection whose password or members apply.
 */
export function lockExplanation(access: Access, kind: "graph" | "collection", name?: string) {
  const whose = name ? `${name}` : `this ${kind}`;
  if (access === "password")
    return `Password protected. Visitors who aren't members of ${whose} are asked for the password; unlocking lasts 30 days on that browser.`;
  if (access === "members")
    return `Members only. Visitors who aren't signed in are asked to sign in, and only members of ${whose} can read it.`;
  return undefined;
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
  const text = lockExplanation(access, what, name);
  if (!text) return null;
  return <LockHint text={text} className={className} />;
}

export function LockHint({ text, className }: { text: string; className?: string }) {
  return (
    <span
      title={text}
      tabIndex={0}
      className="inline-flex shrink-0 cursor-help items-center align-middle text-muted-foreground outline-none focus-visible:text-foreground"
    >
      <LockIcon className={cn("size-3.5", className)} aria-hidden />
      <span className="sr-only">{text}</span>
    </span>
  );
}
