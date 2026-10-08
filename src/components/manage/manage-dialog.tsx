"use client";

import { BookIcon, ChevronDownIcon, ChevronRightIcon, FolderIcon, PlusIcon, RefreshCwIcon, SearchIcon, Settings2Icon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { setPageSearchable, unpublish } from "@/server/actions/dashboard";
import { addToCollection, removeEntry, updateGraphPlace } from "@/server/actions/places";
import { PlaceSettingsFields, RUNG_ICONS } from "./place-settings";
import { setPageTags } from "@/server/actions/tags";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import type { ContainerDefaults, ManageData } from "@/lib/manage-data";
import { hideFromGraphBlocked } from "@/lib/control-rules";
import { cn } from "cn";
import { lockExplanation } from "@/components/access-lock";
import { PRIVACY_ICONS } from "@/components/privacy-icons";
import type { Access as ReadAccess, EntryListing } from "@/db/schema";
import { notSearchable, RUNG_LABELS, rungOf } from "./labels";
import { EncryptionSection } from "./encryption-section";
import { PlacePasswordForm, type PlaceState } from "./place-access-form";
import { usePasswordPrompt } from "./password-prompt";
import { TagsEditor } from "./tags-editor";
import { NEEDS_REPUBLISH } from "@/lib/encryption-rules";

const noop = () => () => {};

const effective = (s: PlaceState, def: ReadAccess) => (s.access === "inherit" ? def : s.access);

/** A stored listing as the place settings name it. */
const REACH_OF = { unlisted: "unlisted", listed: "public", discover: "discover" } as const;

/**
 * Everything about where a page appears and who can read it, on the dashboard and on the published
 * page itself for people who can manage it.
 */
export function ManageDialog({
  data,
  trigger = "button",
  afterUnpublish,
}: {
  data: ManageData;
  trigger?: "button" | "floating";
  afterUnpublish?: string;
}) {
  const router = useRouter();
  // On the published page, `?manage` (from links elsewhere in the dashboard) opens it straight away.
  const asked = useSyncExternalStore(
    noop,
    () => trigger === "floating" && new URLSearchParams(window.location.search).has("manage"),
    () => false,
  );
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? asked;
  function setOpen(o: boolean) {
    setChosen(o);
    if (!o && asked) {
      const url = new URL(window.location.href);
      url.searchParams.delete("manage");
      window.history.replaceState(window.history.state, "", url);
    }
  }
  const [pending, start] = useTransition();
  const refresh = () => router.refresh();
  const passwordPrompt = usePasswordPrompt();

  /** Runs a change; for an encrypted page, asks for its current password when the change needs it. */
  function run(fn: (currentPassword?: string) => Promise<{ ok: boolean; message: string; needCurrentPassword?: boolean }>) {
    start(async () => {
      const res = await passwordPrompt.run(fn);
      if (!res) return;
      if (!res.ok) toast.error(res.message);
      else if (res.message) toast.success(res.message);
      refresh();
    });
  }

  const g = data.graphPlace;
  const gAccess = effective(g.state, g.container.defaultAccess);
  const gListing: EntryListing = g.visibility === "unlisted" ? "unlisted" : g.discoverable && gAccess === "open" ? "discover" : "listed";
  // One place open at a time, starting with the first.
  const [openPlace, setOpenPlace] = useState<string | null>(g.inGraph ? "graph" : (data.entries[0]?.entryId ?? null));
  const toggle = (id: string) => setOpenPlace((cur) => (cur === id ? null : id));
  // Pages on Discover are always searchable, so the search switch is locked on.
  const onDiscover =
    (g.inGraph && gListing === "discover") ||
    data.entries.some((e) => e.state.listing === "discover" && effective(e.state, e.container.defaultAccess) === "open");
  // Hiding it from the graph would leave it shown nowhere.
  const hideBlocked = g.inGraph ? hideFromGraphBlocked(data.entries.length) : undefined;
  const encryptionPanel = data.canManagePage ? <EncryptionSection data={data} onChanged={refresh} compact /> : null;
  // Page-wide, so every place shows the same switch under Public, saying whether
  // search reaches the page through that place.
  const searchPanel = (access: ReadAccess, listing: EntryListing, container: ContainerDefaults) =>
    data.canManagePage ? (
      <PasswordPanel>
        <SearchToggle
          searchable={data.searchable}
          locked={onDiscover}
          skipped={searchSkipped(access, listing, container)}
          place={container.label}
          disabled={pending}
          onChange={(searchable) => run(() => setPageSearchable(data.publicationId, searchable))}
        />
      </PasswordPanel>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger === "floating" ? (
            <Button variant="outline" size="sm" className="gap-1.5 bg-card">
              <Settings2Icon /> Manage
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              Manage
            </Button>
          )
        }
      />
      <DialogContent className="max-h-[90vh] overflow-x-hidden overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-6 break-words">{data.title}</DialogTitle>
          <DialogDescription>
            From {data.origin.graphName} · Roam uid <code>{data.origin.rootUid}</code>
          </DialogDescription>
        </DialogHeader>

        {data.needsRepublish && (
          <p className="flex gap-2 rounded-sm border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <RefreshCwIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>Needs republish. {NEEDS_REPUBLISH}</span>
          </p>
        )}

        {passwordPrompt.element}
        {data.canManagePage && data.encrypted && (
          <section className="flex flex-col gap-1">
            <h3 className="font-medium">Tags</h3>
            <p className="text-xs text-muted-foreground">
              Tags are off while this page is encrypted. Your tag changes are kept for when you turn it off.
            </p>
          </section>
        )}
        {data.canManagePage && !data.encrypted && (
          <TagsEditor
            tags={data.tags}
            hidden={data.hiddenTags}
            pending={pending}
            onChange={(change) => run(() => setPageTags(data.publicationId, change))}
          />
        )}

        <section className="flex flex-col gap-2">
          <h3 className="font-medium">Where it&apos;s published</h3>
          <ul className="divide-y rounded-sm border">
            <PlaceRow
              kind="graph"
              name={data.origin.graphName}
              path={g.inGraph ? g.path : undefined}
              empty={`Not shown in ${data.origin.graphName}`}
              access={gAccess}
              listing={gListing}
              searchable={data.searchable}
              encrypted={data.encrypted}
              open={openPlace === "graph"}
              onToggle={() => toggle("graph")}
              action={
                data.canManagePage &&
                (g.inGraph ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove from ${data.origin.graphName}`}
                    title={hideBlocked ? `It's only shown in ${data.origin.graphName}. ${hideBlocked}` : `Remove from ${data.origin.graphName}`}
                    className="text-muted-foreground"
                    disabled={pending || !!hideBlocked}
                    onClick={() => {
                      if (!confirm(`Remove it from ${data.origin.graphName}? Its link there stops working until you add it back. It stays in its collections.`)) return;
                      run((currentPassword) => updateGraphPlace(data.publicationId, { inGraph: false, currentPassword }));
                    }}
                  >
                    <XIcon />
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => run((currentPassword) => updateGraphPlace(data.publicationId, { inGraph: true, currentPassword }))}
                  >
                    <PlusIcon /> Add back
                  </Button>
                ))
              }
            >
              {data.canManagePage && hideBlocked && (
                <p className="text-xs text-muted-foreground">
                  It&apos;s only published here, so it can&apos;t be removed from {data.origin.graphName}. {hideBlocked}
                </p>
              )}
              {data.canManagePage && g.inGraph ? (
                <PlaceSettingsFields
                  target={{ kind: "graph", publicationId: data.publicationId, frontPage: g.frontPage, indexable: g.indexable }}
                  access={REACH_OF[gListing]}
                  discoverBlocked={g.discoverBlocked}
                  place={g}
                  searchable={data.searchable}
                  visibilityPanel={searchPanel(gAccess, gListing, g.container)}
                  passwordPanel={
                    <PasswordPanel>
                      <PlacePasswordForm
                        kind="graph"
                        id={data.publicationId}
                        hasOwnPassword={g.state.hasOwnPassword}
                        container={g.container}
                        encrypted={data.encrypted}
                        onSaved={refresh}
                      />
                      {encryptionPanel}
                    </PasswordPanel>
                  }
                />
              ) : (
                <ReadOnlyPlace lock={lockExplanation(gAccess, "graph", g.container.label, data.encrypted)} />
              )}
            </PlaceRow>
            {data.entries.map((e) => {
              const access = effective(e.state, e.container.defaultAccess);
              const listing = e.state.listing ?? "listed";
              return (
                <PlaceRow
                  key={e.entryId}
                  kind="collection"
                  name={e.collectionName}
                  path={e.path}
                  access={access}
                  listing={listing}
                  searchable={data.searchable}
                  encrypted={data.encrypted}
                  open={openPlace === e.entryId}
                  onToggle={() => toggle(e.entryId)}
                  action={
                    (e.canManage || data.canManagePage) && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove from ${e.collectionName}`}
                        title={`Remove from ${e.collectionName}`}
                        className="text-muted-foreground"
                        disabled={pending}
                        onClick={() => {
                          const last = !g.inGraph && data.entries.length === 1;
                          const question = `Remove it from ${e.collectionName}? Its link there stops working, and its settings there are lost.${
                            last ? ` It's the last place it's shown, so it goes back to ${data.origin.graphName} as Unlisted.` : ""
                          }`;
                          if (confirm(question)) run((currentPassword) => removeEntry(e.entryId, currentPassword));
                        }}
                      >
                        <XIcon />
                      </Button>
                    )
                  }
                >
                  {e.canManage ? (
                    <PlaceSettingsFields
                      target={{ kind: "entry", entryId: e.entryId }}
                      access={REACH_OF[listing]}
                      discoverBlocked={e.container.discoverBlocked}
                      place={e}
                      searchable={data.searchable}
                      visibilityPanel={searchPanel(access, listing, e.container)}
                      passwordPanel={
                        <PasswordPanel>
                          <PlacePasswordForm
                            kind="entry"
                            id={e.entryId}
                            hasOwnPassword={e.state.hasOwnPassword}
                            container={e.container}
                            encrypted={data.encrypted}
                            onSaved={refresh}
                          />
                          {encryptionPanel}
                        </PasswordPanel>
                      }
                    />
                  ) : (
                    <ReadOnlyPlace lock={lockExplanation(access, "collection", e.collectionName, data.encrypted)} />
                  )}
                </PlaceRow>
              );
            })}
          </ul>
          {data.addable.length > 0 && (
            <AddToCollection
              addable={data.addable}
              disabled={pending}
              onAdd={(id) => run((currentPassword) => addToCollection(data.publicationId, id, currentPassword))}
            />
          )}
        </section>

        {data.canManagePage && (
          <div className="flex justify-end border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={pending}
              onClick={() => {
                if (!confirm("Unpublish this page everywhere? Its links stop working.")) return;
                start(async () => {
                  await unpublish(data.publicationId);
                  setOpen(false);
                  if (afterUnpublish) router.push(afterUnpublish);
                  else refresh();
                });
              }}
            >
              Unpublish everywhere
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * One place a page appears, as a row you open to change it: graph or collection icon, its name,
 * and who can read the page there and where it's listed.
 */
function PlaceRow({
  kind,
  name,
  path,
  empty,
  access,
  listing,
  searchable,
  encrypted,
  open,
  onToggle,
  action,
  children,
}: {
  kind: "graph" | "collection";
  name: string;
  path?: string;
  empty?: string;
  access: ReadAccess;
  listing: EntryListing;
  searchable: boolean;
  encrypted?: boolean;
  open: boolean;
  onToggle: () => void;
  action?: React.ReactNode;
  /** Its settings, or what it is for people who can't change it. */
  children: React.ReactNode;
}) {
  const KindIcon = kind === "graph" ? BookIcon : FolderIcon;
  return (
    <li className="flex flex-col">
      <div className="flex items-center gap-2 py-1.5 pr-3 pl-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-start gap-2 rounded-sm px-2 py-1 text-left outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronRightIcon className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          <KindIcon aria-label={kind === "graph" ? "Graph" : "Collection"} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-medium">{name}</span>
            <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {path ? <AccessWords access={access} listing={listing} searchable={searchable} encrypted={encrypted} /> : empty}
            </span>
          </span>
        </button>
        {action && <div className="flex shrink-0 items-center">{action}</div>}
      </div>
      {open && (
        <div className="flex flex-col gap-3 pr-3 pb-3 pl-10">
          {path ? (
            <>
              <Link href={path} className="truncate text-xs text-link hover:underline">
                {path}
              </Link>
              {children}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">{empty}</span>
          )}
        </div>
      )}
    </li>
  );
}

/** "Public", "Unlisted", "Password · title shown", with its icon; "Public (Not Searchable)" out of search. */
function AccessWords({
  access,
  listing,
  searchable,
  encrypted,
}: {
  access: ReadAccess;
  listing: EntryListing;
  searchable: boolean;
  encrypted?: boolean;
}) {
  const rung = rungOf(access, listing);
  const Icon = rung === "password" && encrypted ? PRIVACY_ICONS.encrypted : RUNG_ICONS[rung];
  return (
    <>
      <Icon aria-hidden className="size-3 shrink-0" />
      {rung === "password" && encrypted ? "Encrypted" : RUNG_LABELS[rung]}
      {rung === "public" && notSearchable(true, searchable)}
      {access !== "open" && listing !== "unlisted" && (
        <>
          <span aria-hidden>·</span> title shown
        </>
      )}
    </>
  );
}

/** Under Password while a place uses it: which password, then encryption. */
function PasswordPanel({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3 rounded-sm bg-muted/50 p-3 [&>*+*]:border-t [&>*+*]:pt-3">{children}</div>;
}

/** Why roam.pub search doesn't show the page through this place, if it doesn't. Mirrors lib/site-search.ts. */
function searchSkipped(access: ReadAccess, listing: EntryListing, container: ContainerDefaults) {
  if (listing === "unlisted") return "it's Unlisted here";
  if (access === "password") return "it's password protected here";
  if (access === "members") return "only members can read it here";
  if (container.searchBlocked) return container.searchBlocked;
  if (listing === "listed" && !container.searchListed) return `${container.label} keeps its Public pages out of search`;
}

/**
 * "Show in roam.pub search", under Public. Pages on Discover are always searchable, so
 * it's locked on. The setting is page-wide, but where search can't reach the page (say, it's password
 * protected here) the switch shows off and disabled, and says why.
 */
function SearchToggle({
  searchable,
  locked,
  skipped,
  place,
  disabled,
  onChange,
}: {
  searchable: boolean;
  locked: boolean;
  /** Why search doesn't show the page through this place, if it doesn't. */
  skipped?: string;
  place: string;
  disabled: boolean;
  onChange: (searchable: boolean) => void;
}) {
  const id = useId();
  const on = !skipped && (searchable || locked);
  return (
    <div className="flex items-start gap-3">
      {on ? (
        <SearchIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      ) : (
        <PRIVACY_ICONS.unsearchable className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <label htmlFor={id} className="font-medium">
          Show in roam.pub search
        </label>
        <span className="text-xs text-muted-foreground">
          {skipped
            ? `Not in roam.pub/search from ${place}: ${skipped}.`
            : !on
              ? "Kept out of roam.pub/search. It's still listed."
              : locked
                ? "Pages on Discover are always searchable."
                : `People can find this page from roam.pub/search, through ${place}.`}
        </span>
      </div>
      <Switch id={id} checked={on} disabled={disabled || locked || !!skipped} onCheckedChange={onChange} />
    </div>
  );
}

/** A place this viewer can't change: who can read it there, explained. */
function ReadOnlyPlace({ lock }: { lock?: string }) {
  return (
    <p className="text-xs text-muted-foreground">
      {lock ?? "Anyone with the link can read it here."} Only whoever manages it can change this.
    </p>
  );
}

/**
 * Adds the page to one of the viewer's collections. A menu with a search box, so it stays one
 * button however many collections there are; each collection the page is in gets its own row above.
 */
function AddToCollection({
  addable,
  disabled,
  onAdd,
}: {
  addable: { id: string; name: string }[];
  disabled: boolean;
  onAdd: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? addable.filter((c) => c.name.toLowerCase().includes(q)) : addable;
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className="self-start" disabled={disabled}>
            <PlusIcon /> Add to a collection
            <ChevronDownIcon className="opacity-60" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-72 gap-1 p-1.5">
        {addable.length > 6 && (
          <Input
            type="search"
            aria-label="Find a collection"
            placeholder="Find a collection"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8"
          />
        )}
        <ul className="flex max-h-56 flex-col overflow-y-auto" aria-label="Collections">
          {shown.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setQuery("");
                  onAdd(c.id);
                }}
                className="flex min-h-8 w-full items-center rounded-sm px-2 text-left outline-none hover:bg-accent focus-visible:bg-accent"
              >
                <span className="truncate">{c.name}</span>
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="px-2 py-1.5 text-xs text-muted-foreground">No collection matches.</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
