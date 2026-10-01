"use client";

import { CheckIcon, ChevronDownIcon, CompassIcon, GlobeIcon, LinkIcon } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "cn";
import { type Access, setAccess } from "./actions";

const ICONS = { unlisted: LinkIcon, public: GlobeIcon, discover: CompassIcon };
const LABELS = { unlisted: "Unlisted", public: "Public", discover: "Discover" };

/**
 * One control for how far a page reaches: link only, the graph's front page and search engines,
 * or also roam.pub/discover. Each option says what it means for this graph's settings.
 */
export function AccessMenu({
  publicationId,
  access,
  frontPage,
  indexable,
  discoverBlocked,
}: {
  publicationId: string;
  access: Access;
  frontPage: boolean;
  indexable: boolean;
  /** Why this graph can't list pages on Discover right now, if it can't. */
  discoverBlocked?: string;
}) {
  const [open, setOpen] = useState(false);
  const [optimistic, setOptimistic] = useOptimistic(access);
  const [pending, start] = useTransition();
  const Icon = ICONS[optimistic];
  const paused = optimistic === "discover" && !!discoverBlocked;

  const options: { value: Access; description: string; disabled?: string }[] = [
    { value: "unlisted", description: "Only people with the link. Never indexed." },
    {
      value: "public",
      description: [
        frontPage ? "Listed on your front page." : "Your front page is off, so it isn't listed anywhere.",
        indexable ? "Search engines can index it." : "Hidden from search engines.",
      ].join(" "),
    },
    { value: "discover", description: "Public, and also listed on roam.pub/discover.", disabled: discoverBlocked },
  ];

  function choose(next: Access) {
    setOpen(false);
    if (next === optimistic) return;
    start(async () => {
      setOptimistic(next);
      await setAccess(publicationId, next);
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            title={paused ? `Not shown on Discover: ${discoverBlocked}` : undefined}
            className={cn("gap-1.5", paused && "text-muted-foreground")}
          >
            <Icon />
            {LABELS[optimistic]}
            {paused && " (paused)"}
            <ChevronDownIcon className="opacity-60" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-72 gap-1 p-1">
        <div role="radiogroup" aria-label="Who can find this page" className="flex flex-col">
          {options.map((o) => {
            const OptionIcon = ICONS[o.value];
            const selected = o.value === optimistic;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!!o.disabled && !selected}
                onClick={() => choose(o.value)}
                className="flex items-start gap-2.5 rounded-sm px-2 py-2 text-left outline-none hover:bg-accent focus-visible:bg-accent disabled:pointer-events-none disabled:opacity-50"
              >
                <OptionIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-medium">{LABELS[o.value]}</span>
                  <span className="text-xs text-muted-foreground">{o.disabled ?? o.description}</span>
                </span>
                <CheckIcon className={cn("mt-0.5 size-4 shrink-0", !selected && "invisible")} />
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
