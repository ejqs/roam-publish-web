"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { cn } from "cn";
import { writeSeenCookie } from "@/lib/whats-new-shared";

/** The small blue dot that says there's something new on /updates. */
export function UnseenDot({ className }: { className?: string }) {
  return (
    <>
      <span aria-hidden className={cn("inline-block size-1.5 shrink-0 rounded-full bg-primary", className)} />
      <span className="sr-only"> (new)</span>
    </>
  );
}

/**
 * A "What's new" link, with the dot when there's something unseen. `plant` is set on a first visit:
 * it records what's there now, so the dot shows when something new lands and not for the backlog.
 */
export function WhatsNewAnchor({
  dot,
  plant,
  className,
  version,
}: {
  dot: boolean;
  plant: string | null;
  className?: string;
  /** The site's version, shown after the label as one link ("What's new · v0.5.0"). */
  version?: string;
}) {
  // On /updates itself, that visit is what clears the dot.
  const here = usePathname() === "/updates";
  useEffect(() => {
    if (plant) writeSeenCookie(plant);
  }, [plant]);
  return (
    <Link href="/updates" className={cn("inline-flex items-center gap-1", className)}>
      What&apos;s new
      {version && <span className="tabular-nums"> · v{version}</span>}
      {dot && !here && <UnseenDot />}
    </Link>
  );
}
