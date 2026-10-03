"use client";

import { ChevronRightIcon, CircleHelpIcon, CompassIcon, GlobeIcon, LinkIcon, LockIcon, UsersIcon } from "lucide-react";
import { useId, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { ACCESS_DESCRIPTIONS, LISTING_LABELS } from "@/components/manage/labels";
import { placeViewsOptions, VIEWS_HELP, VIEWS_LABELS } from "@/components/manage/views-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type Segment, SegmentedControl } from "@/components/ui/segmented-control";
import type { PlaceViews, Access as ReadAccess, ShowAuthor } from "@/db/schema";
import type { ManageData } from "@/lib/manage-data";
import { showsViewCountries, viewsMode } from "@/lib/views";
import { cn } from "cn";
import { type Access, setAccess } from "./actions";
import { updateEntry, updateGraphPlace } from "./place-actions";

export const ICONS = { unlisted: LinkIcon, public: GlobeIcon, discover: CompassIcon };
export const LABELS = { unlisted: LISTING_LABELS.unlisted, public: LISTING_LABELS.listed, discover: LISTING_LABELS.discover };
export const READ_ICONS = { open: GlobeIcon, password: LockIcon, members: UsersIcon };
export const READ_LABELS = { open: "Anyone", password: "Password", members: "Members" };

/** The place a setting changes: a page in its graph, or a page's entry in a collection. */
export type MenuTarget =
  | { kind: "graph"; publicationId: string; frontPage: boolean; indexable: boolean }
  | { kind: "entry"; entryId: string };

export type PlaceSettingsProps = {
  target: MenuTarget;
  /** Where it's listed; a collection's "listed" is "public" here. */
  access: Access;
  /** Why this graph or collection can't list pages on Discover right now, if it can't (ignoring the page's own access). */
  discoverBlocked?: string;
  place: Pick<ManageData["graphPlace"], "state" | "container">;
};

type PlaceInput = { access?: ReadAccess; showAuthor?: ShowAuthor; views?: PlaceViews; showViewCountries?: ShowAuthor };

const NOT_ON_DISCOVER = "Only pages anyone can read go on Discover.";

/** What to warn about before a page goes onto or comes off Discover, or null when the change doesn't touch it. */
function discoverWarning(from: Access, to: Access, protecting = false) {
  if (from !== "discover" && to !== "discover") return null;
  if (from === to) return null;
  if (to === "discover") return "Put this page on roam.pub/discover? Anyone can find it there.";
  return protecting
    ? "Protecting this page takes it off roam.pub/discover and lists it instead. Continue?"
    : "Take this page off roam.pub/discover?";
}

/**
 * One place's settings, saved as they change: where it's listed, who can read it, its byline and
 * view count. Choosing Password with no password to use asks for one first and changes nothing
 * until it's set. Protecting a Discoverable page lists it instead, since Discover only shows open pages.
 */
export function usePlaceSettings({ target, access, discoverBlocked, place }: PlaceSettingsProps) {
  const { container } = place;
  const [optimistic, setOptimistic] = useOptimistic({
    access,
    // "inherit" only survives on rows from before pages stored their own access.
    read: (place.state.access === "inherit" ? container.defaultAccess : place.state.access) as ReadAccess,
    showAuthor: place.state.showAuthor,
    views: place.state.views,
    showViewCountries: place.state.showViewCountries,
  });
  const [pending, start] = useTransition();
  const [askPassword, setAskPassword] = useState(false);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  const read = optimistic.read;
  const blocked = read !== "open" ? NOT_ON_DISCOVER : discoverBlocked;
  // Gating a page takes it off Discover; show that right away instead of after the refresh.
  const reach: Access = optimistic.access === "discover" && read !== "open" ? "public" : optimistic.access;
  const paused = reach === "discover" && !!blocked;
  const hasPassword = place.state.hasOwnPassword || container.hasPassword;
  const listed = reach !== "unlisted";
  const views = viewsMode(container, { views: optimistic.views }, listed);
  const countries = showsViewCountries(container, { showViewCountries: optimistic.showViewCountries });
  const byline = optimistic.showAuthor === "inherit" ? container.showAuthors : optimistic.showAuthor === "show";

  function done(res: { ok: boolean; message: string } | null | undefined) {
    if (res && !res.ok) toast.error(res.message);
    else setSaved(true);
  }

  function chooseReach(next: Access) {
    if (next === reach) return;
    const warning = discoverWarning(reach, next);
    if (warning && !confirm(warning)) return;
    setNote("");
    start(async () => {
      setOptimistic((s) => ({ ...s, access: next }));
      done(
        target.kind === "graph"
          ? await setAccess(target.publicationId, next)
          : await updateEntry(target.entryId, { listing: next === "public" ? "listed" : next }),
      );
    });
  }

  function save(next: PlaceInput) {
    start(async () => {
      setOptimistic((s) => ({
        ...s,
        ...(next.access && { read: next.access }),
        ...(next.showAuthor && { showAuthor: next.showAuthor }),
        ...(next.views && { views: next.views }),
        ...(next.showViewCountries && { showViewCountries: next.showViewCountries }),
      }));
      done(target.kind === "graph" ? await updateGraphPlace(target.publicationId, next) : await updateEntry(target.entryId, next));
    });
  }

  const movedOffDiscover = (next: ReadAccess) =>
    next !== "open" && reach === "discover"
      ? setNote("Moved from Discover to Listed. Discover only shows pages anyone can read.")
      : setNote("");

  function chooseRead(next: ReadAccess) {
    if (next === read) return setAskPassword(false);
    const warning = next !== "open" ? discoverWarning(reach, "public", true) : null;
    if (warning && !confirm(warning)) return;
    // Nothing to unlock with yet: ask for this page's password, and change nothing until it's set.
    if (next === "password" && !hasPassword) return setAskPassword(true);
    setAskPassword(false);
    movedOffDiscover(next);
    save({ access: next });
  }

  async function savePassword(password: string) {
    const input = { access: "password" as const, password };
    const res =
      target.kind === "graph" ? await updateGraphPlace(target.publicationId, input) : await updateEntry(target.entryId, input);
    if (res.ok) {
      setAskPassword(false);
      movedOffDiscover("password");
      toast.success("Password set.");
    }
    return res;
  }

  return {
    target,
    container,
    pending,
    saved,
    note,
    read,
    reach,
    blocked,
    paused,
    hasPassword,
    listed,
    views,
    countries,
    byline,
    optimistic,
    askPassword,
    setAskPassword,
    chooseReach,
    chooseRead,
    save,
    savePassword,
  };
}

export type PlaceSettings = ReturnType<typeof usePlaceSettings>;

/** "Byline hidden · View count: everyone · Countries shown", for the collapsed Display row. */
export function displaySummary(s: PlaceSettings) {
  return [
    `Byline ${s.byline ? "shown" : "hidden"}`,
    s.read !== "members" && `View count: ${VIEWS_LABELS[s.views].toLowerCase()}`,
    s.read !== "members" && s.views === "show" && `Countries ${s.countries ? "shown" : "hidden"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Who can read it and where it's listed: two segmented controls, with what the choice means under each. */
export function AccessFields({ s, compact }: { s: PlaceSettings; compact?: boolean }) {
  const id = useId();
  const { container, target } = s;

  const readSegments: Segment<ReadAccess>[] = (["open", "password", "members"] as const).map((v) => ({
    value: v,
    label: READ_LABELS[v],
    icon: READ_ICONS[v],
  }));
  const readDescription = {
    open:
      container.defaultAccess !== "open"
        ? "Anyone with the link can read, even though the rest is protected."
        : "Anyone with the link. No sign-in or password needed.",
    password: ACCESS_DESCRIPTIONS.password,
    members: `Only people invited to publish to ${container.label}, once signed in.`,
  }[s.read];

  const reachSegments: Segment<Access>[] = (["unlisted", "public", "discover"] as const).map((v) => ({
    value: v,
    label: v === "discover" ? "Discover" : LABELS[v],
    icon: ICONS[v],
    disabled: v === "discover" && s.reach !== "discover" ? s.blocked : undefined,
  }));
  const reachDescription = {
    unlisted: "Only people with the link can find it. Never indexed.",
    public:
      target.kind === "entry"
        ? `Listed on ${container.label}'s page.`
        : [
            target.frontPage ? "On your front page." : "Your front page is off, so it isn't listed anywhere.",
            target.indexable ? "Search engines can index it." : "Hidden from search engines.",
          ].join(" "),
    discover: s.paused ? `Not shown on Discover right now: ${s.blocked}` : "Listed, and also on roam.pub/discover.",
  }[s.reach];

  const caption = "text-xs text-muted-foreground";
  return (
    <div className={cn("flex flex-col", compact ? "gap-3" : "gap-4")}>
      <div className="flex flex-col gap-1.5">
        <span id={`${id}-read`} className={cn("font-medium", compact && "text-xs text-muted-foreground")}>
          Access control
        </span>
        <SegmentedControl
          aria-labelledby={`${id}-read`}
          value={s.askPassword ? "password" : s.read}
          options={readSegments}
          onChange={s.chooseRead}
          disabled={s.pending}
        />
        <p className={caption}>{s.askPassword ? "Readers enter a password. Set one to switch." : readDescription}</p>
        {s.askPassword && <SetPasswordForm onSave={s.savePassword} onCancel={() => s.setAskPassword(false)} />}
      </div>
      <div className="flex flex-col gap-1.5">
        <span id={`${id}-reach`} className={cn("font-medium", compact && "text-xs text-muted-foreground")}>
          Visibility control
        </span>
        <SegmentedControl
          aria-labelledby={`${id}-reach`}
          value={s.reach}
          options={reachSegments}
          onChange={s.chooseReach}
          disabled={s.pending}
        />
        <p className={caption}>
          {reachDescription}
          {s.read !== "open" && !s.note && s.reach !== "discover" && " Discover is only for pages anyone can read."}
        </p>
        {s.note && (
          <p role="status" className="rounded-sm bg-muted px-2 py-1.5 text-xs">
            {s.note}
          </p>
        )}
      </div>
    </div>
  );
}

/** Asks for a page's own password before switching it to Password access. */
function SetPasswordForm({
  onSave,
  onCancel,
}: {
  onSave: (password: string) => Promise<{ ok: boolean; message: string }>;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-1"
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
      <div className="flex gap-2">
        <Input
          type="password"
          autoComplete="new-password"
          aria-label="Password for this page"
          placeholder="Password for this page"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!error}
          className="h-8"
        />
        <Button type="submit" size="sm" disabled={pending || !password}>
          {pending ? "Saving…" : "Set password"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}

/** Byline, view count and reader countries, each following the graph or collection unless set here. */
export function DisplayFields({ s }: { s: PlaceSettings }) {
  const id = useId();
  const { container, optimistic } = s;
  const inheritLabel = (on: boolean) => `Inherit (${on ? "Shown" : "Hidden"})`;
  const uses = `Uses ${container.label}'s setting.`;

  const bylineOptions: (Segment<ShowAuthor> & { description: string })[] = [
    { value: "inherit", label: inheritLabel(container.showAuthors), description: uses },
    { value: "show", label: "Show", description: "The author's name shows under the title." },
    { value: "hide", label: "Hide", description: "No byline on this page." },
  ];
  const viewsOptions = placeViewsOptions(container, s.listed);
  const countriesOptions: (Segment<ShowAuthor> & { description: string })[] = [
    { value: "inherit", label: inheritLabel(container.showViewCountries), description: uses },
    { value: "show", label: "Show", description: "Flags of the top countries next to the count." },
    { value: "hide", label: "Hide", description: "Only the count shows." },
  ];
  const describe = <T extends string>(opts: { value: T; description?: string }[], v: T) =>
    opts.find((o) => o.value === v)?.description;

  return (
    <div className="flex flex-col gap-4">
      <Setting id={`${id}-byline`} label="Author byline" description={describe(bylineOptions, optimistic.showAuthor)}>
        <SegmentedControl
          aria-labelledby={`${id}-byline`}
          value={optimistic.showAuthor}
          options={bylineOptions}
          onChange={(v) => s.save({ showAuthor: v })}
          disabled={s.pending}
        />
      </Setting>
      {/* Members-only pages have no view count. */}
      {s.read === "members" ? (
        <p className="text-xs text-muted-foreground">Members-only pages have no view count.</p>
      ) : (
        <>
          <Setting
            id={`${id}-views`}
            label="View count visibility"
            help={<ViewsHelp />}
            description={describe(viewsOptions, optimistic.views)}
          >
            <SegmentedControl
              aria-labelledby={`${id}-views`}
              value={optimistic.views}
              options={viewsOptions}
              onChange={(v) => s.save({ views: v })}
              disabled={s.pending}
            />
          </Setting>
          {s.views === "show" && (
            <Setting
              id={`${id}-countries`}
              label="Reader country visibility"
              description={describe(countriesOptions, optimistic.showViewCountries)}
            >
              <SegmentedControl
                aria-labelledby={`${id}-countries`}
                value={optimistic.showViewCountries}
                options={countriesOptions}
                onChange={(v) => s.save({ showViewCountries: v })}
                disabled={s.pending}
              />
            </Setting>
          )}
        </>
      )}
    </div>
  );
}

function Setting({
  id,
  label,
  help,
  description,
  children,
}: {
  id: string;
  label: string;
  help?: React.ReactNode;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span id={id} className="font-medium">
          {label}
        </span>
        {help}
      </div>
      {children}
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}

/** The ? next to View count visibility: what Private and Off mean. */
function ViewsHelp() {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        aria-label="What do Private and Off mean?"
        className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <CircleHelpIcon className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 gap-1.5 text-xs">
        <p>
          <span className="font-medium">Private</span> {VIEWS_HELP.hide}
        </p>
        <p>
          <span className="font-medium">Off</span> {VIEWS_HELP.off}
        </p>
      </PopoverContent>
    </Popover>
  );
}

/** A collapsible Display section: a one-line summary when closed, the fields when open. */
export function DisplaySection({ s, defaultOpen = false }: { s: PlaceSettings; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="-mx-1 flex min-h-7 items-start gap-2 rounded-sm px-1 py-1 text-left outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ChevronRightIcon className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className="font-medium">Display</span>
        <span className="min-w-0 flex-1 pt-0.5 text-xs text-muted-foreground">{displaySummary(s)}</span>
      </button>
      {open && (
        <div id={id}>
          <DisplayFields s={s} />
        </div>
      )}
    </div>
  );
}

/** The settings for one place, inline in the Manage dialog. */
export function PlaceSettingsFields(props: PlaceSettingsProps) {
  const s = usePlaceSettings(props);
  return (
    <div className="flex flex-col gap-4">
      <AccessFields s={s} />
      <div className="h-px bg-border" />
      <DisplaySection s={s} />
      <p aria-live="polite" className="-mt-2 h-4 text-right text-xs text-muted-foreground">
        {s.pending ? "Saving…" : s.saved ? "Saved" : ""}
      </p>
    </div>
  );
}
