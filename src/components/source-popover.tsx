"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** The footer's "Source code" link: clicking it lists the three repos (web, extension, docs). */
export function SourcePopover({
  className,
  links,
}: {
  className: string;
  links: { label: string; href: string }[];
}) {
  return (
    <Popover>
      <PopoverTrigger className={`${className} cursor-pointer`}>Source code</PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-40 gap-1 p-2 text-sm">
        {links.map((l) => (
          <a
            key={l.label}
            href={l.href}
            target="_blank"
            rel="noopener"
            className="rounded-sm px-2 py-1 hover:bg-accent"
          >
            {l.label}
          </a>
        ))}
      </PopoverContent>
    </Popover>
  );
}
