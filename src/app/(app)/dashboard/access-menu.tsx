"use client";

import { CheckIcon, ChevronDownIcon, LockKeyholeIcon, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "cn";
import {
  AccessFields,
  DisplaySection,
  ICONS,
  LABELS,
  type MenuTarget,
  type PlaceSettingsProps,
  READ_ICONS,
  READ_LABELS,
  usePlaceSettings,
} from "./place-settings";

export { ICONS, LABELS, type MenuTarget };

export type Option<T> = { value: T; label: string; description?: string; disabled?: string; icon?: LucideIcon };

/**
 * One place's settings behind a button, for dashboard rows. The button says who can read it and
 * where it's listed ("Password · Listed"); the popover holds the same controls as the Manage dialog
 * and stays open while you change them.
 */
export function AccessMenu(props: PlaceSettingsProps) {
  const s = usePlaceSettings(props);
  const [open, setOpen] = useState(false);
  const Icon = s.read === "open" ? ICONS[s.reach] : s.encrypted ? LockKeyholeIcon : READ_ICONS[s.read];
  const readLabel = s.encrypted ? "Encrypted" : READ_LABELS[s.read];
  const label = s.read === "open" ? LABELS[s.reach] : `${readLabel} · ${s.reach === "unlisted" ? "Not listed" : "Listed"}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            title={s.paused ? `Not shown on Discover: ${s.blocked}` : undefined}
            className={cn("max-w-full gap-1.5", s.paused && "text-muted-foreground")}
          >
            <Icon />
            <span className="truncate">
              {label}
              {s.paused && " (paused)"}
            </span>
            <ChevronDownIcon className="opacity-60" />
          </Button>
        }
      />
      <PopoverContent align="start" className="max-h-(--available-height) w-[22rem] gap-3 overflow-y-auto p-3">
        <AccessFields s={s} compact />
        <div className="-mx-3 h-px bg-border" />
        <DisplaySection s={s} />
      </PopoverContent>
    </Popover>
  );
}

/** A radio list for one setting in a menu, used by the bulk toolbar. */
export function Section<T extends string>({
  label,
  value,
  options,
  onChoose,
}: {
  label: string;
  value: T;
  options: Option<T>[];
  onChoose: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-col not-first:mt-1 not-first:border-t not-first:pt-1">
      <span className="px-2 pt-1.5 pb-0.5 text-xs font-medium text-muted-foreground">{label}</span>
      {options.map((o) => {
        const OptionIcon = o.icon;
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!!o.disabled && !selected}
            onClick={() => onChoose(o.value)}
            className="flex items-start gap-2.5 rounded-sm px-2 py-2 text-left outline-none hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-50"
          >
            {OptionIcon && <OptionIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-medium">{o.label}</span>
              {(o.disabled ?? o.description) && (
                <span className="text-xs text-muted-foreground">{o.disabled ?? o.description}</span>
              )}
            </span>
            <CheckIcon className={cn("mt-0.5 size-4 shrink-0", !selected && "invisible")} />
          </button>
        );
      })}
    </div>
  );
}
