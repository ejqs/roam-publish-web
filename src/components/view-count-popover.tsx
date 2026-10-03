"use client";

import type { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** The footer's view count; hovering, focusing or tapping it shows where the number comes from. */
export function ViewCountPopover({ label, trigger, children }: { label: string; trigger: ReactNode; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
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
