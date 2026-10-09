"use client";

import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PRIVACY_ICONS, type PrivacyNote } from "./privacy-icons";

/**
 * Small labels after a published page's title saying it's protected or not listed, each explaining
 * itself on hover, focus or tap.
 */
export function PrivacyBadges({ notes, className }: { notes: PrivacyNote[]; className?: string }) {
  if (!notes.length) return null;
  return (
    <span className={className}>
      {notes.map((n) => {
        const Icon = PRIVACY_ICONS[n.kind];
        return (
          <Popover key={n.kind}>
            <PopoverTrigger
              openOnHover
              delay={150}
              className="inline-flex h-6 cursor-help items-center gap-1 rounded-4xl bg-muted px-2 align-middle text-xs leading-none font-medium tracking-normal text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Icon className="size-3.5" aria-hidden />
              {n.label}
            </PopoverTrigger>
            <PopoverContent side="bottom" align="start" className="w-72 gap-1 text-xs">
              <p className="font-medium">
                {n.label}
                {n.tag && <span className="ml-1 font-mono text-[10px] text-muted-foreground">{n.tag}</span>}
              </p>
              <p className="text-muted-foreground">{n.text}</p>
              {n.href && (
                <Link href={n.href} className="text-link hover:underline">
                  {n.linkLabel ?? "How it works"}
                </Link>
              )}
            </PopoverContent>
          </Popover>
        );
      })}
    </span>
  );
}
