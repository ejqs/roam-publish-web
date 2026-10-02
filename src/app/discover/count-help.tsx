"use client";

import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Opens on hover, focus + Enter, and tap, so it works without a mouse. */
export function CountHelp({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        aria-label={label}
        className="inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <CircleHelp className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-sm font-normal">
        {children}
      </PopoverContent>
    </Popover>
  );
}
