"use client";

import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";

/** The asterisk after "small fee" on the costs page; opens a short note on what a fee would cover. */
export function FeeNote() {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="About the small fee"
        className="mx-0.5 cursor-pointer rounded-sm px-0.5 font-semibold text-primary outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 data-popup-open:bg-accent"
      >
        *
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 gap-1.5 p-3 text-sm">
        <PopoverTitle>About the small fee</PopoverTitle>
        <PopoverDescription>
          If I ever charge, it would be just enough to cover hosting and development. I&apos;m not looking to make a quick buck.
        </PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}
