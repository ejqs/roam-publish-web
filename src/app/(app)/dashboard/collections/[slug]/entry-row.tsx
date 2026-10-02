"use client";

import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, LockIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { removeEntry } from "@/app/(app)/dashboard/place-actions";
import { lockExplanation } from "@/components/access-lock";
import { ACCESS_LABELS, LISTING_LABELS } from "@/components/manage/choice";
import { PlaceAccessForm, type PlaceState } from "@/components/manage/place-access-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { moveEntry } from "../actions";

export function EntryRow({
  entryId,
  title,
  path,
  origin,
  addedBy,
  removed,
  canManage,
  canReorder,
  first,
  last,
  state,
  container,
}: {
  entryId: string;
  title: string;
  path: string;
  origin: string;
  addedBy: string;
  removed: boolean;
  canManage: boolean;
  canReorder: boolean;
  first: boolean;
  last: boolean;
  state: PlaceState;
  container: React.ComponentProps<typeof PlaceAccessForm>["container"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const access = state.access === "inherit" ? container.defaultAccess : state.access;
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.message);
      router.refresh();
    });

  return (
    <li className="flex flex-col gap-2 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link href={path} className="truncate text-link hover:underline">
            {title}
          </Link>
          <span className="text-xs text-muted-foreground">
            From {origin} · added by {addedBy}
          </span>
          <span className="flex flex-wrap gap-1">
            {state.listing && <Badge variant="outline">{LISTING_LABELS[state.listing]}</Badge>}
            {access !== "open" && (
              <Badge variant="outline" title={lockExplanation(access, "collection", container.label)} className="cursor-help">
                <LockIcon /> {ACCESS_LABELS[access]}
              </Badge>
            )}
            {removed && <Badge variant="destructive">Removed by moderator</Badge>}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {canReorder && (
            <>
              <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={pending || first} onClick={() => run(() => moveEntry(entryId, -1))}>
                <ArrowUpIcon />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={pending || last} onClick={() => run(() => moveEntry(entryId, 1))}>
                <ArrowDownIcon />
              </Button>
            </>
          )}
          {canManage && !removed && (
            <>
              <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
                Access <ChevronDownIcon className={cn(open && "rotate-180")} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                disabled={pending}
                onClick={() => {
                  if (confirm("Remove this page from the collection? Its link here stops working.")) run(() => removeEntry(entryId));
                }}
              >
                Remove
              </Button>
            </>
          )}
        </div>
      </div>
      {open && (
        <div className="rounded-sm border p-3">
          <PlaceAccessForm kind="entry" id={entryId} initial={state} container={container} onSaved={() => router.refresh()} />
        </div>
      )}
    </li>
  );
}
