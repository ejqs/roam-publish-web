"use client";

import { CheckIcon, ChevronDownIcon, CompassIcon, GlobeIcon, LinkIcon, type LucideIcon } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { LISTING_LABELS, readOptions } from "@/components/manage/choice";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PlaceViews, Access as ReadAccess, ShowAuthor } from "@/db/schema";
import { VIEWS_LABELS } from "@/components/manage/views-fields";
import { viewsMode } from "@/lib/views";
import type { ManageData } from "@/lib/manage-data";
import { cn } from "cn";
import { type Access, setAccess } from "./actions";
import { updateEntry, updateGraphPlace } from "./place-actions";

export const ICONS = { unlisted: LinkIcon, public: GlobeIcon, discover: CompassIcon };
export const LABELS = { unlisted: LISTING_LABELS.unlisted, public: LISTING_LABELS.listed, discover: LISTING_LABELS.discover };

export type Option<T> = { value: T; label: string; description?: string; disabled?: string; icon?: LucideIcon };

/** The place a menu changes: a page in its graph, or a page's entry in a collection. */
export type MenuTarget =
  | { kind: "graph"; publicationId: string; frontPage: boolean; indexable: boolean }
  | { kind: "entry"; entryId: string };

/**
 * One control for one place a page appears: where it's listed (link only, the graph's or
 * collection's page, or also roam.pub/discover), who can read it, its byline and view count. Each option
 * saves on click. Choosing Password with no password to use asks for one first; cancelling keeps
 * the current access. A Discoverable page stays open until it isn't.
 */
export function AccessMenu({
  target,
  access,
  discoverBlocked,
  place,
}: {
  target: MenuTarget;
  /** Where it's listed; a collection's "listed" is "public" here. */
  access: Access;
  /** Why this graph or collection can't list pages on Discover right now, if it can't (ignoring the page's own access). */
  discoverBlocked?: string;
  place: Pick<ManageData["graphPlace"], "state" | "container">;
}) {
  const [open, setOpen] = useState(false);
  const [askPassword, setAskPassword] = useState(false);
  const [optimistic, setOptimistic] = useOptimistic({
    access,
    // "inherit" only survives on rows from before pages stored their own access.
    read: (place.state.access === "inherit" ? place.container.defaultAccess : place.state.access) as ReadAccess,
    showAuthor: place.state.showAuthor,
    views: place.state.views,
    showViewCountries: place.state.showViewCountries,
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
    { value: "unlisted", label: LABELS.unlisted, icon: ICONS.unlisted, description: "Only people with the link can find it. Never indexed." },
    {
      value: "public",
      label: LABELS.public,
      icon: ICONS.public,
      description:
        target.kind === "entry"
          ? `Listed on ${container.label}'s page.`
          : [
              target.frontPage ? "Listed on your front page." : "Your front page is off, so it isn't listed anywhere.",
              target.indexable ? "Search engines can index it." : "Hidden from search engines.",
            ].join(" "),
    },
    {
      value: "discover",
      label: LABELS.discover,
      icon: ICONS.discover,
      description: "Listed, and also on roam.pub/discover.",
      disabled: blocked,
    },
  ];

  const readChoices: Option<ReadAccess>[] = readOptions(container.label).map((o) => ({
    ...o,
    description:
      o.value === "open" && container.defaultAccess !== "open"
        ? "Anyone with the link can read, even though the rest is protected."
        : o.value === "password" && !hasPassword
          ? "Readers enter a password. You'll set one next."
          : o.description,
    disabled: o.value !== "open" && reach === "discover" ? "Discoverable pages stay open. Choose Listed or Not listed first." : undefined,
  }));

  const bylineOptions: Option<ShowAuthor>[] = [
    { value: "inherit", label: `Use ${container.label}'s setting (${container.showAuthors ? "shown" : "hidden"})` },
    { value: "show", label: "Show" },
    { value: "hide", label: "Hide" },
  ];

  // An unlisted page keeps its count to its managers unless it's set to show.
  const listedNow = reach !== "unlisted";
  const inheritedViews = viewsMode(container, { views: "inherit" }, listedNow);
  const viewsOptions: Option<PlaceViews>[] = [
    {
      value: "inherit",
      label: `Use ${container.label}'s setting (${inheritedViews === "hide" ? "managers only" : VIEWS_LABELS[inheritedViews].toLowerCase()})`,
      description: !listedNow && container.views === "show" ? "Unlisted pages show their count only when set to Show." : undefined,
    },
    { value: "show", label: "Show", description: "Everyone sees the count from 10 views." },
    { value: "hide", label: "Only people who manage it", description: "Visitors see nothing; you see it with a crossed-out eye." },
    { value: "off", label: "Off", description: "No count anywhere, not even for you." },
  ];
  const countriesOptions: Option<ShowAuthor>[] = [
    { value: "inherit", label: `Use ${container.label}'s setting (${container.showViewCountries ? "shown" : "hidden"})` },
    { value: "show", label: "Show" },
    { value: "hide", label: "Hide" },
  ];
  const showsCount = viewsMode(container, { views: optimistic.views }, listedNow) === "show";

  function chooseReach(next: Access) {
    setOpen(false);
    if (next === reach) return;
    start(async () => {
      setOptimistic((s) => ({ ...s, access: next }));
      const res =
        target.kind === "graph"
          ? await setAccess(target.publicationId, next)
          : await updateEntry(target.entryId, { listing: next === "public" ? "listed" : next });
      if (res && !res.ok) toast.error(res.message);
    });
  }

  function choosePlace(next: {
    access?: ReadAccess;
    showAuthor?: ShowAuthor;
    views?: PlaceViews;
    showViewCountries?: ShowAuthor;
  }) {
    setOpen(false);
    if (
      next.access === optimistic.read ||
      next.showAuthor === optimistic.showAuthor ||
      next.views === optimistic.views ||
      next.showViewCountries === optimistic.showViewCountries
    )
      return;
    // Nothing to unlock with yet: ask for this page's password, and change nothing until it's set.
    if (next.access === "password" && !hasPassword) return setAskPassword(true);
    start(async () => {
      setOptimistic((s) => ({
        ...s,
        ...(next.access && { read: next.access }),
        ...(next.showAuthor && { showAuthor: next.showAuthor }),
        ...(next.views && { views: next.views }),
        ...(next.showViewCountries && { showViewCountries: next.showViewCountries }),
      }));
      const res =
        target.kind === "graph" ? await updateGraphPlace(target.publicationId, next) : await updateEntry(target.entryId, next);
      if (!res.ok) toast.error(res.message);
    });
  }

  async function savePassword(password: string) {
    const input = { access: "password" as const, password };
    const res =
      target.kind === "graph" ? await updateGraphPlace(target.publicationId, input) : await updateEntry(target.entryId, input);
    if (res.ok) {
      setAskPassword(false);
      toast.success("Password set.");
    }
    return res;
  }

  return (
    <>
      <SetPasswordDialog open={askPassword} onCancel={() => setAskPassword(false)} onSave={savePassword} />
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
          <Section label="Where it's listed" value={reach} options={reachOptions} onChoose={chooseReach} />
          <Section
            label="Who can read it"
            value={optimistic.read}
            options={readChoices}
            onChoose={(a) => choosePlace({ access: a })}
          />
          <Section
            label="Author byline"
            value={optimistic.showAuthor}
            options={bylineOptions}
            onChoose={(s) => choosePlace({ showAuthor: s })}
          />
          <Section
            label="View count"
            value={optimistic.views}
            options={viewsOptions}
            onChoose={(v) => choosePlace({ views: v })}
          />
          {showsCount && (
            <Section
              label="Reader countries"
              value={optimistic.showViewCountries}
              options={countriesOptions}
              onChoose={(v) => choosePlace({ showViewCountries: v })}
            />
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}

/** Asks for a page's own password before switching it to Password access. */
function SetPasswordDialog({
  open,
  onCancel,
  onSave,
}: {
  open: boolean;
  onCancel: () => void;
  onSave: (password: string) => Promise<{ ok: boolean; message: string }>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const close = () => {
    setPassword("");
    setError("");
    onCancel();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await onSave(password);
              if (!res.ok) return setError(res.message);
              setPassword("");
              setError("");
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Set a password</DialogTitle>
            <DialogDescription>Readers enter it to open this page. Unlocking lasts 30 days on that browser.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Input
              type="password"
              autoComplete="new-password"
              aria-label="Password for this page"
              placeholder="Password for this page"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !password}>
              {pending ? "Saving…" : "Set password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
