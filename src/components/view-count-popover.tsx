"use client";

import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * The footer's view count; hovering or clicking it shows where the number comes from, and for people
 * who manage the page, its settings. The popup stays open while the pointer is over it.
 */
export function ViewCountPopover({ label, trigger, children }: { label: string; trigger: ReactNode; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={200}
        aria-label={label}
        className="-mx-1 -my-0.5 inline-flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-muted-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 data-popup-open:bg-accent"
      >
        {trigger}
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 gap-2.5 p-3 text-xs">
        {children}
      </PopoverContent>
    </Popover>
  );
}
