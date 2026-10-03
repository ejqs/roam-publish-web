"use client";

import { ChevronDownIcon, KeyRoundIcon, LockIcon, PlusIcon, Settings2Icon, TriangleAlertIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { unpublish } from "@/app/(app)/dashboard/actions";
import { addToCollection, removeEntry, updateGraphPlace } from "@/app/(app)/dashboard/place-actions";
import { PlaceSettingsFields } from "@/app/(app)/dashboard/place-settings";
import { setPageTags } from "@/app/(app)/dashboard/tag-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import type { ManageData } from "@/lib/manage-data";
import { cn } from "cn";
import { lockExplanation } from "@/components/access-lock";
import { ACCESS_LABELS, LISTING_LABELS } from "./choice";
import { PlacePasswordForm, type PlaceState } from "./place-access-form";
import { TagsEditor } from "./tags-editor";

const effective = (s: PlaceState, def: keyof typeof ACCESS_LABELS) => (s.access === "inherit" ? def : s.access);

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
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const refresh = () => router.refresh();

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.message);
      else if (res.message) toast.success(res.message);
      refresh();
    });
  }

  const g = data.graphPlace;
  const gAccess = effective(g.state, g.container.defaultAccess);
  const exposure = mostOpenPlace([
    ...(g.inGraph ? [{ name: `${data.origin.graphName} (its graph)`, path: g.path, access: gAccess }] : []),
    ...data.entries.map((e) => ({
      name: e.collectionName,
      path: e.path,
      access: effective(e.state, e.container.defaultAccess),
    })),
  ]);

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

        {exposure && (
          <p className="flex gap-2 rounded-sm border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              {exposure.least.access === "open" ? "Anyone with the link" : "Anyone with the password"} can read this
              page in{" "}
              <Link href={exposure.least.path} className="font-medium text-link hover:underline">
                {exposure.least.name}
              </Link>
              , even though it&apos;s {exposure.most.access === "members" ? "members only" : "password protected"} in{" "}
              {exposure.most.name}.
            </span>
          </p>
        )}

        {data.canManagePage && (
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
              label={`Graph · ${data.origin.graphName}`}
              path={g.inGraph ? g.path : undefined}
              empty={`Not shown in ${data.origin.graphName}`}
              access={gAccess}
              lock={lockExplanation(gAccess, "graph", g.container.label)}
              settings={
                data.canManagePage && g.inGraph ? (
                  <PlaceSettingsFields
                    target={{ kind: "graph", publicationId: data.publicationId, frontPage: g.frontPage, indexable: g.indexable }}
                    access={g.visibility === "unlisted" ? "unlisted" : g.discoverable ? "discover" : "public"}
                    discoverBlocked={g.discoverBlocked}
                    place={g}
                  />
                ) : undefined
              }
              listing={g.visibility === "unlisted" ? "unlisted" : g.discoverable && gAccess === "open" ? "discover" : "listed"}
              action={
                data.canManagePage && (
                  <Switch
                    aria-label="Show in graph"
                    title={g.inGraph ? `Shown in ${data.origin.graphName}` : `Not shown in ${data.origin.graphName}`}
                    checked={g.inGraph}
                    disabled={pending}
                    onCheckedChange={(inGraph) => run(() => updateGraphPlace(data.publicationId, { inGraph }))}
                  />
                )
              }
              password={
                data.canManagePage && g.inGraph && gAccess === "password" ? (
                  <PlacePasswordForm
                    kind="graph"
                    id={data.publicationId}
                    hasOwnPassword={g.state.hasOwnPassword}
                    container={g.container}
                    onSaved={refresh}
                  />
                ) : undefined
              }
            />
            {data.entries.map((e) => {
              const access = effective(e.state, e.container.defaultAccess);
              return (
                <PlaceRow
                  key={e.entryId}
                  label={`Collection · ${e.collectionName}`}
                  path={e.path}
                  access={access}
                  lock={lockExplanation(access, "collection", e.collectionName)}
                  settings={
                    e.canManage ? (
                      <PlaceSettingsFields
                        target={{ kind: "entry", entryId: e.entryId }}
                        access={e.state.listing === "listed" || !e.state.listing ? "public" : e.state.listing}
                        discoverBlocked={e.container.discoverBlocked}
                        place={e}
                      />
                    ) : undefined
                  }
                  listing={e.state.listing ?? "listed"}
                  action={
                    (e.canManage || data.canManagePage) && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove from ${e.collectionName}`}
                        title={`Remove from ${e.collectionName}`}
                        className="text-muted-foreground"
                        disabled={pending}
                        onClick={() => run(() => removeEntry(e.entryId))}
                      >
                        <XIcon />
                      </Button>
                    )
                  }
                  password={
                    e.canManage && access === "password" ? (
                      <PlacePasswordForm
                        kind="entry"
                        id={e.entryId}
                        hasOwnPassword={e.state.hasOwnPassword}
                        container={e.container}
                        onSaved={refresh}
                      />
                    ) : undefined
                  }
                />
              );
            })}
          </ul>
          {data.addable.length > 0 && (
            <AddToCollection
              addable={data.addable}
              disabled={pending}
              onAdd={(id) => run(() => addToCollection(data.publicationId, id))}
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

const STRICTNESS = { open: 0, password: 1, members: 2 } as const;

type PlaceSummary = { name: string; path: string; access: keyof typeof ACCESS_LABELS };

/** The least and most protected places, when they differ. */
function mostOpenPlace(places: PlaceSummary[]) {
  if (places.length < 2) return null;
  const sorted = [...places].sort((a, b) => STRICTNESS[a.access] - STRICTNESS[b.access]);
  const [least, most] = [sorted[0], sorted[sorted.length - 1]];
  return STRICTNESS[least.access] < STRICTNESS[most.access] ? { least, most } : null;
}

/** One place a page appears: its link, where it's listed and who can read it, and its own password. */
function PlaceRow({
  label,
  path,
  empty,
  access,
  lock,
  listing,
  settings,
  action,
  password,
}: {
  label: string;
  path?: string;
  empty?: string;
  access: keyof typeof ACCESS_LABELS;
  lock?: string;
  listing: keyof typeof LISTING_LABELS;
  /** Its settings, for people who can change this place. */
  settings?: React.ReactNode;
  action?: React.ReactNode;
  password?: React.ReactNode;
}) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <li className="flex flex-col gap-3 p-3">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs text-muted-foreground">{label}</span>
          {path ? (
            <Link href={path} className="truncate text-link hover:underline">
              {path}
            </Link>
          ) : (
            <span className="text-muted-foreground">{empty}</span>
          )}
        </div>
        {action && <div className="flex shrink-0 items-center">{action}</div>}
      </div>
      {path && (settings ?? <PlaceBadges access={access} listing={listing} lock={lock} />)}
      {path && password && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start text-muted-foreground"
          aria-expanded={showPassword}
          onClick={() => setShowPassword(!showPassword)}
        >
          <KeyRoundIcon /> Page password
          <ChevronDownIcon className={cn(showPassword && "rotate-180")} />
        </Button>
      )}
      {path && showPassword && password}
    </li>
  );
}

function PlaceBadges({
  access,
  listing,
  lock,
}: {
  access: keyof typeof ACCESS_LABELS;
  listing: keyof typeof LISTING_LABELS;
  lock?: string;
}) {
  return (
    <span className="flex flex-wrap gap-1">
      <Badge variant="outline">{LISTING_LABELS[listing]}</Badge>
      {access !== "open" && (
        <Badge variant="outline" title={lock} className="cursor-help">
          <LockIcon /> {ACCESS_LABELS[access]}
        </Badge>
      )}
    </span>
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
