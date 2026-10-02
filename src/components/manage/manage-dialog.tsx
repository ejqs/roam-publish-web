"use client";

import { ChevronDownIcon, LockIcon, PlusIcon, Settings2Icon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { unpublish } from "@/app/(app)/dashboard/actions";
import { addToCollection, removeEntry, updateGraphPlace } from "@/app/(app)/dashboard/place-actions";
import { setPageTags } from "@/app/(app)/dashboard/tag-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import type { ManageData } from "@/lib/manage-data";
import { cn } from "cn";
import { lockExplanation } from "@/components/access-lock";
import { ACCESS_LABELS, LISTING_LABELS } from "./choice";
import { PlaceAccessForm, type PlaceState } from "./place-access-form";
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
  const [editing, setEditing] = useState<string | null>(null);
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
          <h3 className="font-medium">In its graph</h3>
          <div className="flex items-start justify-between gap-3 rounded-sm border p-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {g.inGraph ? (
                <Link href={g.path} className="block truncate text-link hover:underline">
                  {g.path}
                </Link>
              ) : (
                <span className="text-muted-foreground">Not shown in {data.origin.graphName}</span>
              )}
              {g.inGraph && (
                <PlaceBadges
                  access={gAccess}
                  listing={g.visibility === "unlisted" ? "unlisted" : g.discoverable && gAccess === "open" ? "discover" : "listed"}
                  lock={lockExplanation(gAccess, "graph", g.container.label)}
                />
              )}
            </div>
            {data.canManagePage && (
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  aria-label="Show in graph"
                  checked={g.inGraph}
                  disabled={pending}
                  onCheckedChange={(inGraph) => run(() => updateGraphPlace(data.publicationId, { inGraph }))}
                />
                {g.inGraph && (
                  <Button variant="outline" size="sm" onClick={() => setEditing(editing === "graph" ? null : "graph")}>
                    Access <ChevronDownIcon className={cn(editing === "graph" && "rotate-180")} />
                  </Button>
                )}
              </div>
            )}
          </div>
          {editing === "graph" && g.inGraph && (
            <div className="rounded-sm border p-3">
              <PlaceAccessForm kind="graph" id={data.publicationId} initial={g.state} container={g.container} onSaved={refresh} />
            </div>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="font-medium">In collections</h3>
          {data.entries.length === 0 && <p className="text-muted-foreground">Not in any collection.</p>}
          {data.entries.map((e) => (
            <div key={e.entryId} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-3 rounded-sm border p-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-medium">{e.collectionName}</span>
                  <Link href={e.path} className="block truncate text-link hover:underline">
                    {e.path}
                  </Link>
                  <PlaceBadges
                    access={effective(e.state, e.container.defaultAccess)}
                    listing={e.state.listing ?? "listed"}
                    lock={lockExplanation(effective(e.state, e.container.defaultAccess), "collection", e.collectionName)}
                  />
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {e.canManage && (
                    <Button variant="outline" size="sm" onClick={() => setEditing(editing === e.entryId ? null : e.entryId)}>
                      Access <ChevronDownIcon className={cn(editing === e.entryId && "rotate-180")} />
                    </Button>
                  )}
                  {(e.canManage || data.canManagePage) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      disabled={pending}
                      onClick={() => run(() => removeEntry(e.entryId))}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              {editing === e.entryId && (
                <div className="rounded-sm border p-3">
                  <PlaceAccessForm kind="entry" id={e.entryId} initial={e.state} container={e.container} onSaved={refresh} />
                </div>
              )}
            </div>
          ))}
          {data.addable.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.addable.map((c) => (
                <Button
                  key={c.id}
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(() => addToCollection(data.publicationId, c.id))}
                >
                  <PlusIcon /> {c.name}
                </Button>
              ))}
            </div>
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
