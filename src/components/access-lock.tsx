import { LockIcon } from "lucide-react";
import type { Access } from "@/db/schema";

const EXPLAIN = {
  password: (what: string) =>
    `Password protected. Visitors who aren't members of this ${what} are asked for the password; unlocking lasts 30 days on that browser.`,
  members: (what: string) =>
    `Members only. Visitors who aren't signed in are asked to sign in, and signed-in people who aren't members of this ${what} can't open it.`,
};

/** A lock beside a front page's title when it's protected; hovering explains what visitors see. */
export function AccessLock({ access, what }: { access: Access; what: "graph" | "collection" }) {
  if (access === "open") return null;
  const text = EXPLAIN[access](what);
  return (
    <span
      title={text}
      tabIndex={0}
      className="inline-flex cursor-help items-center align-middle text-muted-foreground outline-none focus-visible:text-foreground"
    >
      <LockIcon className="size-7" aria-hidden />
      <span className="sr-only">{text}</span>
    </span>
  );
}
