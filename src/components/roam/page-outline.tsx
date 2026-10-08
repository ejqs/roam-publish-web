"use client";

import { ChevronRightIcon, PanelLeftCloseIcon, TableOfContentsIcon } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import type { Heading } from "@/lib/headings";
import { cn } from "@/lib/utils";

const indent = { 1: "pl-2", 2: "pl-5", 3: "pl-8" } as const;

function Links({ headings, active }: { headings: Heading[]; active?: string }) {
  // Indent relative to the page's biggest heading, so a page of only h2s isn't pushed in.
  const top = Math.min(...headings.map((h) => h.level));
  return (
    <ul className="flex flex-col gap-0.5 text-sm">
      {headings.map((h) => (
        <li key={h.id}>
          <a
            href={`#${h.id}`}
            aria-current={h.id === active ? "location" : undefined}
            className={cn(
              "block rounded-sm border-l-2 border-transparent py-1 pr-2 leading-snug text-muted-foreground hover:bg-muted hover:text-foreground",
              indent[(h.level - top + 1) as 1 | 2 | 3],
              h.id === active && "border-primary font-medium text-foreground",
            )}
          >
            <span className="line-clamp-2">{h.text}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The heading last scrolled past the top of the window, for highlighting in the outline. */
function useActiveHeading(headings: Heading[]) {
  const [active, setActive] = useState<string>();
  useEffect(() => {
    const update = () => {
      let current: string | undefined;
      for (const h of headings) {
        const el = document.getElementById(h.id);
        // Folded-away headings have no box; skip them.
        if (!el || !el.offsetParent) continue;
        if (el.getBoundingClientRect().top > 96) break;
        current = h.id;
      }
      setActive(current ?? headings[0]?.id);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [headings]);
  return active;
}

// Whether the reader hid the outline, remembered in this browser for every page.
const HIDDEN_KEY = "outline-hidden";
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const readHidden = () => {
  try {
    return localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
};
const writeHidden = (hidden: boolean) => {
  try {
    if (hidden) localStorage.setItem(HIDDEN_KEY, "1");
    else localStorage.removeItem(HIDDEN_KEY);
  } catch {}
  listeners.forEach((l) => l());
};

const subscribeScroll = (l: () => void) => {
  window.addEventListener("scroll", l, { passive: true });
  return () => window.removeEventListener("scroll", l);
};

/** The page's headings beside it on wide screens, following the reader down the page. The reader can hide it. */
export function PageOutlineAside({ headings, className }: { headings: Heading[]; className?: string }) {
  const active = useActiveHeading(headings);
  const hidden = useSyncExternalStore(subscribe, readHidden, () => false);
  const atTop = useSyncExternalStore(subscribeScroll, () => window.scrollY < 80, () => true);
  return (
    <nav aria-label="Outline" className={className}>
      <div className="group/outline sticky top-16 max-h-[calc(100vh-8rem)] overflow-y-auto">
        {hidden ? (
          // Only near the top of the page: nobody toggles it back on mid-read, so it shouldn't follow them down.
          <div className={cn("flex justify-end transition-opacity", !atTop && "pointer-events-none opacity-0")}>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              tabIndex={atTop ? undefined : -1}
              aria-label="Show the outline"
              title="Show the outline"
              onClick={() => writeHidden(false)}
            >
              <TableOfContentsIcon />
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between gap-2 pl-2">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">On this page</p>
              <Button
                variant="ghost"
                size="icon-sm"
                // Shown while the pointer is on the outline.
                className="text-muted-foreground opacity-0 transition-opacity group-hover/outline:opacity-100 focus-visible:opacity-100"
                aria-label="Hide the outline"
                title="Hide the outline"
                onClick={() => writeHidden(true)}
              >
                <PanelLeftCloseIcon />
              </Button>
            </div>
            <Links headings={headings} active={active} />
          </>
        )}
      </div>
    </nav>
  );
}

/** The same outline, folded above the page on narrow screens. */
export function PageOutlineDetails({ headings, className }: { headings: Heading[]; className?: string }) {
  return (
    <details className={cn("group rounded-sm border border-border", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="size-4 transition-transform group-open:rotate-90" />
        On this page
      </summary>
      <nav aria-label="Outline" className="px-1 pb-2">
        <Links headings={headings} />
      </nav>
    </details>
  );
}
