"use client";

import { CheckIcon, ChevronDownIcon, CompassIcon, GlobeIcon, LinkIcon, type LucideIcon } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { ACCESS_DESCRIPTIONS, ACCESS_LABELS } from "@/components/manage/choice";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Access as ReadAccess, ShowAuthor } from "@/db/schema";
import type { ManageData } from "@/lib/manage-data";
import { cn } from "cn";
import { type Access, setAccess } from "./actions";
import { updateGraphPlace } from "./place-actions";

const ICONS = { unlisted: LinkIcon, public: GlobeIcon, discover: CompassIcon };
const LABELS = { unlisted: "Unlisted", public: "Public", discover: "Discover" };

type Option<T> = { value: T; label: string; description?: string; disabled?: string; icon?: LucideIcon };

/**
 * One control for a page's place in its graph: how far it reaches (link only, the graph's front
 * page and search engines, or also roam.pub/discover), who can read it, and its byline. Each
 * option saves on click; setting a page's own password still happens in Manage.
 */
export function AccessMenu({
  publicationId,
  access,
  frontPage,
  indexable,
  discoverBlocked,
  place,
}: {
  publicationId: string;
  access: Access;
  frontPage: boolean;
  indexable: boolean;
  /** Why this graph can't list pages on Discover right now, if it can't (ignoring the page's own access). */
  discoverBlocked?: string;
  place: ManageData["graphPlace"];
}) {
  const [open, setOpen] = useState(false);
  const [optimistic, setOptimistic] = useOptimistic({
    access,
    // "inherit" only survives on rows from before pages stored their own access.
    read: (place.state.access === "inherit" ? place.container.defaultAccess : place.state.access) as ReadAccess,
    showAuthor: place.state.showAuthor,
  });
  const [pending, start] = useTransition();
  const { container } = place;
  const effectiveRead = optimistic.read;
  const blocked = effectiveRead !== "open" ? "Protected pages can't go on Discover." : discoverBlocked;
  // Gating a page takes it off Discover; show that right away instead of after the refresh.
  const reach = optimistic.access === "discover" && effectiveRead !== "open" ? "public" : optimistic.access;
  const Icon = ICONS[reach];
  const paused = reach === "discover" && !!blocked;
  const hasPassword = place.state.hasOwnPassword || container.hasPassword;

  const reachOptions: Option<Access>[] = [
    { value: "unlisted", label: LABELS.unlisted, icon: ICONS.unlisted, description: "Only people with the link. Never indexed." },
    {
      value: "public",
      label: LABELS.public,
      icon: ICONS.public,
      description: [
        frontPage ? "Listed on your front page." : "Your front page is off, so it isn't listed anywhere.",
        indexable ? "Search engines can index it." : "Hidden from search engines.",
      ].join(" "),
    },
    {
      value: "discover",
      label: LABELS.discover,
      icon: ICONS.discover,
      description: "Public, and also listed on roam.pub/discover.",
      disabled: blocked,
    },
  ];

  const readOptions: Option<ReadAccess>[] = (["open", "password", "members"] as const).map((a) => ({
      value: a,
      label: ACCESS_LABELS[a],
      description:
        a === "open" && container.defaultAccess !== "open"
          ? "Anyone with the link can read, even though the rest is protected."
          : ACCESS_DESCRIPTIONS[a],
    disabled: a === "password" && !hasPassword ? "Set a password for this page in Manage first." : undefined,
  }));

  const bylineOptions: Option<ShowAuthor>[] = [
    { value: "inherit", label: `Use ${container.label}'s setting (${container.showAuthors ? "shown" : "hidden"})` },
    { value: "show", label: "Show" },
    { value: "hide", label: "Hide" },
  ];

  function chooseReach(next: Access) {
    setOpen(false);
    if (next === reach) return;
    start(async () => {
      setOptimistic((s) => ({ ...s, access: next }));
      const res = await setAccess(publicationId, next);
      if (res && !res.ok) toast.error(res.message);
    });
  }

  function choosePlace(next: { access?: ReadAccess; showAuthor?: ShowAuthor }) {
    setOpen(false);
    if (next.access === optimistic.read || next.showAuthor === optimistic.showAuthor) return;
    start(async () => {
      setOptimistic((s) => ({
        ...s,
        ...(next.access && { read: next.access }),
        ...(next.showAuthor && { showAuthor: next.showAuthor }),
      }));
      const res = await updateGraphPlace(publicationId, next);
      if (!res.ok) toast.error(res.message);
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
            title={paused ? `Not shown on Discover: ${blocked}` : undefined}
            className={cn("gap-1.5", paused && "text-muted-foreground")}
          >
            <Icon />
            {LABELS[reach]}
            {paused && " (paused)"}
            <ChevronDownIcon className="opacity-60" />
          </Button>
        }
      />
      <PopoverContent align="start" className="max-h-(--available-height) w-80 gap-1 overflow-y-auto p-1">
        <Section label="Who can find it" value={reach} options={reachOptions} onChoose={chooseReach} />
        <Section
          label="Who can read it"
          value={optimistic.read}
          options={readOptions}
          onChoose={(a) => choosePlace({ access: a })}
        />
        <Section
          label="Author byline"
          value={optimistic.showAuthor}
          options={bylineOptions}
          onChoose={(s) => choosePlace({ showAuthor: s })}
        />
      </PopoverContent>
    </Popover>
  );
}

function Section<T extends string>({
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
