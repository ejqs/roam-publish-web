"use client";

import { ChevronRightIcon, CircleHelpIcon, CompassIcon, GlobeIcon } from "lucide-react";
import { useId, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  LISTING_LABELS,
  notSearchable,
  RUNG_LABELS,
  RUNGS,
  type Rung,
  rungDescription,
  rungOf,
  showTitleLabel,
} from "@/components/manage/labels";
import { usePasswordPrompt } from "@/components/manage/password-prompt";
import { PRIVACY_ICONS } from "@/components/privacy-icons";
import { placeViewsOptions, VIEWS_HELP, VIEWS_LABELS } from "@/components/manage/views-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type Segment, SegmentedControl } from "@/components/ui/segmented-control";
import type { PlaceViews, Access as ReadAccess, ShowAuthor } from "@/db/schema";
import type { ManageData } from "@/lib/manage-data";
import { showsViewCountries, viewsMode } from "@/lib/views";
import { cn } from "cn";
import { narrowsAccess } from "@/lib/pin-rules";
import { type Access, setAccess } from "@/server/actions/dashboard";
import { updateEntry, updateGraphPlace } from "@/server/actions/places";

export const ICONS = { unlisted: PRIVACY_ICONS.unlisted, public: GlobeIcon, discover: CompassIcon };
export const LABELS = { unlisted: LISTING_LABELS.unlisted, public: LISTING_LABELS.listed, discover: LISTING_LABELS.discover };
export const READ_ICONS = { open: GlobeIcon, password: PRIVACY_ICONS.password, members: PRIVACY_ICONS.members };
export const READ_LABELS = { open: "Anyone", password: "Password", members: "Members" };
export const RUNG_ICONS = {
  discover: CompassIcon,
  public: GlobeIcon,
  unlisted: PRIVACY_ICONS.unlisted,
  password: PRIVACY_ICONS.password,
  members: PRIVACY_ICONS.members,
};

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
  /** The page shows up in roam.pub search (a page-wide switch in the Manage dialog). */
  searchable?: boolean;
  /** Why this place's link can't be made harder to open, when it's pinned (lib/pin-rules.ts). */
  pinned?: string;
};

type PlaceInput = { access?: ReadAccess; showAuthor?: ShowAuthor; views?: PlaceViews; showViewCountries?: ShowAuthor };

const NOT_ON_DISCOVER = "Discover is only for pages anyone can read.";
export const ENCRYPTED_ONLY_PASSWORD = "Encrypted pages can only use Password. Turn off encryption first.";

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
export function usePlaceSettings({ target, access, discoverBlocked, place, searchable = true, pinned }: PlaceSettingsProps) {
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
  const passwordPrompt = usePasswordPrompt();
  const encrypted = !!place.state.encrypted;
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
      const res = await passwordPrompt.run((currentPassword) =>
        target.kind === "graph"
          ? updateGraphPlace(target.publicationId, { ...next, currentPassword })
          : updateEntry(target.entryId, { ...next, currentPassword }),
      );
      // Null: they cancelled the password prompt, so nothing changed.
      if (res) done(res);
    });
  }

  const movedOffDiscover = (next: ReadAccess) =>
    next !== "open" && reach === "discover"
      ? setNote("Taken off Discover, with its title still shown where it's listed. Discover only shows pages anyone can read.")
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

  const kind = target.kind === "graph" ? ("graph" as const) : ("collection" as const);
  const rung = rungOf(read, reach === "public" ? "listed" : reach);

  /**
   * One choice on the ladder. Password and Members keep where it's listed (Discover becomes listed);
   * the open rungs make it readable by anyone and set where it's listed, in that order.
   */
  function chooseRung(next: Rung) {
    if (next === rung) return setAskPassword(false);
    if (next === "password" || next === "members") return chooseRead(next);
    const nextReach: Access = next === "public" ? "public" : next;
    if (read === "open") return chooseReach(nextReach);
    const warning = discoverWarning(reach, nextReach);
    if (warning && !confirm(warning)) return;
    setAskPassword(false);
    setNote("");
    start(async () => {
      setOptimistic((st) => ({ ...st, read: "open", access: nextReach }));
      const res = await passwordPrompt.run((currentPassword) =>
        target.kind === "graph"
          ? updateGraphPlace(target.publicationId, { access: "open", currentPassword })
          : updateEntry(target.entryId, { access: "open", currentPassword }),
      );
      if (!res) return;
      if (!res.ok || nextReach === reach) return done(res);
      done(
        target.kind === "graph"
          ? await setAccess(target.publicationId, nextReach)
          : await updateEntry(target.entryId, { listing: nextReach === "public" ? "listed" : nextReach }),
      );
    });
  }

  async function savePassword(password: string) {
    const input = { access: "password" as const, password };
    const res = (await passwordPrompt.run((currentPassword) =>
      target.kind === "graph"
        ? updateGraphPlace(target.publicationId, { ...input, currentPassword })
        : updateEntry(target.entryId, { ...input, currentPassword }),
    )) ?? { ok: false, message: "" };
    if (res.ok) {
      setAskPassword(false);
      movedOffDiscover("password");
      toast.success("Password set.");
    }
    return res;
  }

  return {
    target,
    kind,
    rung,
    chooseRung,
    container,
    searchable,
    pending,
    saved,
    note,
    read,
    reach,
    blocked,
    paused,
    hasPassword,
    discoverBlocked,
    pinned,
    listed,
    views,
    countries,
    byline,
    optimistic,
    encrypted,
    passwordPrompt: passwordPrompt.element,
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

/** "Public", "Public (Not Searchable)" when the page is out of roam.pub search, or "Password · title shown". */
export const rungLabel = (s: Pick<PlaceSettings, "rung" | "reach" | "searchable" | "encrypted">) =>
  (s.rung === "password" && s.encrypted ? "Encrypted" : RUNG_LABELS[s.rung]) +
  (s.rung === "public" ? notSearchable(true, s.searchable) : "") +
  ((s.rung === "password" || s.rung === "members") && s.reach !== "unlisted" ? " · title shown" : "");

/**
 * Who can see it, as one ladder from Discover to Members. The chosen rung opens up what goes with
 * it: the page's password and encryption under Password, roam.pub search under Public, and whether
 * a protected page's title shows where it's listed.
 */
export function AccessFields({
  s,
  compact,
  passwordPanel,
  visibilityPanel,
}: {
  s: PlaceSettings;
  compact?: boolean;
  /** Shown under Password while this place uses it: which password, and encryption. */
  passwordPanel?: React.ReactNode;
  /** Shown under Public while this place is Public: site search. */
  visibilityPanel?: React.ReactNode;
}) {
  const id = useId();
  const { container } = s;
  const defaultRung = rungOf(container.defaultAccess, container.defaultListing);
  const chosen: Rung = s.askPassword ? "password" : s.rung;

  const disabledReason = (r: Rung) => {
    if (r === chosen) return undefined;
    if (s.pinned && narrowsAccess(s.read, r === "password" || r === "members" ? r : "open")) return s.pinned;
    if (s.encrypted && r !== "password" && r !== "members") return ENCRYPTED_ONLY_PASSWORD;
    if (s.encrypted && r === "members") return ENCRYPTED_ONLY_PASSWORD;
    if (r === "discover") return s.read === "open" ? s.blocked : s.discoverBlocked;
  };

  const caption = "text-xs text-muted-foreground";
  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-who`} className={cn("font-medium", compact && "text-xs text-muted-foreground")}>
        Visibility
      </span>
      <div role="radiogroup" aria-labelledby={`${id}-who`} className="flex flex-col divide-y overflow-hidden rounded-sm border">
        {RUNGS.map((r) => {
          const Icon = r === "password" && s.encrypted ? PRIVACY_ICONS.encrypted : RUNG_ICONS[r];
          const selected = r === chosen;
          const disabled = disabledReason(r);
          const description =
            r === "password" && s.encrypted
              ? "Encrypted. Readers enter the password."
              : r === "discover" && selected && s.paused
                ? `Not shown on Discover right now: ${s.blocked}`
                : rungDescription(r, container.label, s.kind);
          return (
            <div key={r} className={cn("flex flex-col", selected && "bg-primary/8")}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={s.pending || !!disabled}
                title={disabled}
                onClick={() => s.chooseRung(r)}
                className="flex items-start gap-2.5 px-3 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset enabled:hover:bg-accent/60 disabled:cursor-not-allowed"
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 size-4 shrink-0 rounded-full border border-input",
                    selected && "border-[5px] border-primary",
                    disabled && "opacity-50",
                  )}
                />
                <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground", disabled && "opacity-50")} />
                <span className={cn("flex min-w-0 flex-1 flex-col gap-0.5", disabled && "opacity-50")}>
                  <span className="flex items-center gap-1.5 font-medium">
                    {r === "password" && s.encrypted ? "Encrypted" : RUNG_LABELS[r]}
                    {r === defaultRung && (
                      <span className="rounded-sm bg-muted px-1 text-[0.625rem] font-normal text-muted-foreground">default</span>
                    )}
                  </span>
                  {(!compact || selected) && <span className={caption}>{disabled ?? description}</span>}
                </span>
              </button>
              {selected && <RungDetails s={s} rung={r} passwordPanel={passwordPanel} visibilityPanel={visibilityPanel} />}
            </div>
          );
        })}
      </div>
      {s.note && (
        <p role="status" className="rounded-sm bg-muted px-2 py-1.5 text-xs">
          {s.note}
        </p>
      )}
      {s.passwordPrompt}
    </div>
  );
}

/** What opens under the chosen rung. */
function RungDetails({
  s,
  rung,
  passwordPanel,
  visibilityPanel,
}: {
  s: PlaceSettings;
  rung: Rung;
  passwordPanel?: React.ReactNode;
  visibilityPanel?: React.ReactNode;
}) {
  const id = useId();
  const protectedRung = rung === "password" || rung === "members";
  const askPassword = rung === "password" && s.askPassword;
  const body = askPassword ? (
    <SetPasswordForm onSave={s.savePassword} onCancel={() => s.setAskPassword(false)} />
  ) : (
    <>
      {protectedRung && (
        <label htmlFor={id} className="flex items-center gap-2 text-xs">
          <Checkbox
            id={id}
            checked={s.reach !== "unlisted"}
            disabled={s.pending}
            onCheckedChange={(on) => s.chooseReach(on ? "public" : "unlisted")}
          />
          {showTitleLabel(s.container.label, s.kind)}
        </label>
      )}
      {rung === "password" && passwordPanel}
      {rung === "public" && visibilityPanel}
    </>
  );
  const empty = !askPassword && !protectedRung && !(rung === "public" && visibilityPanel);
  if (empty) return null;
  return <div className="flex flex-col gap-2 px-3 pb-3 pl-[3.25rem]">{body}</div>;
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
export function PlaceSettingsFields({
  passwordPanel,
  visibilityPanel,
  ...props
}: PlaceSettingsProps & { passwordPanel?: React.ReactNode; visibilityPanel?: React.ReactNode }) {
  const s = usePlaceSettings(props);
  return (
    <div className="flex flex-col gap-4">
      <AccessFields s={s} passwordPanel={passwordPanel} visibilityPanel={visibilityPanel} />
      <div className="h-px bg-border" />
      <DisplaySection s={s} />
      <p aria-live="polite" className="-mt-2 h-4 text-right text-xs text-muted-foreground">
        {s.pending ? "Saving…" : s.saved ? "Saved" : ""}
      </p>
    </div>
  );
}
