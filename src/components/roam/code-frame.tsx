import type { ReactNode } from "react";

/** A code block's frame: a header naming what's inside, with its actions on the right. */
export function CodeFrame({ label, actions, children }: { label: string; actions: ReactNode; children: ReactNode }) {
  return (
    <figure className="my-1 overflow-hidden rounded-sm border border-border bg-muted">
      <figcaption className="flex h-7 items-center justify-between gap-2 border-b border-border pr-0.5 pl-3 font-sans text-xs text-muted-foreground">
        <span className="truncate">{label}</span>
        <span className="flex shrink-0 items-center gap-0.5 pdf:hidden">{actions}</span>
      </figcaption>
      {children}
    </figure>
  );
}
