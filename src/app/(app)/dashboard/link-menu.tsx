"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "cn";

export type LinkMenuItem = { href: string; label: React.ReactNode; active: boolean };

/** A small dropdown of links, like "Sort: Updated". The links keep working without JavaScript in the URL. */
export function LinkMenu({ label, value, items }: { label: string; value: React.ReactNode; items: LinkMenuItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" aria-label={label}>
            <span className="text-muted-foreground">{label}:</span>
            {value}
            <ChevronDownIcon className="opacity-60" />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-44 gap-0.5 p-1">
        {items.map((it, i) => (
          <Link
            key={i}
            href={it.href}
            onClick={() => setOpen(false)}
            aria-current={it.active ? "true" : undefined}
            className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
          >
            {it.label}
            <CheckIcon className={cn("size-3.5", !it.active && "invisible")} />
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  );
}
