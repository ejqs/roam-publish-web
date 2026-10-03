"use client";

import { ChevronDownIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { createContext, use, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { readOptions } from "@/components/manage/labels";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Access as ReadAccess } from "@/db/schema";
import { ICONS, LABELS, type Option, Section } from "./access-menu";
import type { Access } from "./actions";
import { bulkUnpublish, bulkUpdateEntries, bulkUpdatePublications } from "./place-actions";
import { bulkSetTags } from "./tag-actions";

type Ctx = {
  selected: Set<string>;
  ids: string[];
  /** Current tags per selectable id. */
  tags: Record<string, string[]>;
  /** Tick or untick a row; with `shift`, every row from the last plain-clicked one through it. */
  select: (id: string, on: boolean, shift: boolean) => void;
  setAll: (on: boolean) => void;
};

/** Rows from `anchor` through `id` (in `ids` order) set to `on`; just `id` if there's no usable anchor. */
export function selectRange(ids: string[], prev: Set<string>, anchor: string | null, id: string, on: boolean): Set<string> {
  const a = anchor === null ? -1 : ids.indexOf(anchor);
  const b = ids.indexOf(id);
  const range = a === -1 || b === -1 ? [id] : ids.slice(Math.min(a, b), Math.max(a, b) + 1);
  const next = new Set(prev);
  for (const r of range) {
    if (on) next.add(r);
    else next.delete(r);
  }
  return next;
}
const BulkContext = createContext<Ctx | null>(null);

/**
 * Selection for the dashboard's page list: a checkbox per page the viewer can manage, and a bar to
 * change where the checked pages are listed or who can read them.
 */
export function BulkSelect({
  kind = "graph",
  ids,
  tags = {},
  graphName,
  children,
}: {
  /** Current tags per selectable id, for the Tags menu. */
  tags?: Record<string, string[]>;
  /** A graph's pages (publication ids) or a collection's (entry ids). */
  kind?: "graph" | "collection";
  /** Rows on this page of the list that can be selected. */
  ids: string[];
  /** The graph's or collection's name. */
  graphName: string;
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // The last row clicked without shift, where a shift-click range starts.
  const anchor = useRef<string | null>(null);
  const ctx: Ctx = {
    selected,
    ids,
    tags,
    select: (id, on, shift) => {
      const from = shift ? anchor.current : null;
      if (!shift) anchor.current = id;
      setSelected((prev) => selectRange(ids, prev, from, id, on));
    },
    setAll: (on) => {
      anchor.current = null;
      setSelected(on ? new Set(ids) : new Set());
    },
  };
  return (
    <BulkContext value={ctx}>
      {selected.size > 0 && <BulkBar kind={kind} name={graphName} onDone={() => ctx.setAll(false)} />}
      {children}
    </BulkContext>
  );
}

export function RowCheckbox({ id, title }: { id: string; title: string }) {
  const ctx = use(BulkContext);
  // The change event comes from the hidden input and has no modifier keys, so note shift on the click.
  const shift = useRef(false);
  if (!ctx) return null;
  return (
    <Checkbox
      aria-label={`Select ${title}`}
      checked={ctx.selected.has(id)}
      // Keep shift-click from selecting the text between the two rows.
      onMouseDown={(e) => e.shiftKey && e.preventDefault()}
      onClick={(e) => (shift.current = e.shiftKey)}
      onCheckedChange={(v) => {
        ctx.select(id, !!v, shift.current);
        shift.current = false;
      }}
    />
  );
}

export function AllCheckbox() {
  const ctx = use(BulkContext);
  if (!ctx || ctx.ids.length === 0) return <span />;
  const all = ctx.ids.every((id) => ctx.selected.has(id));
  return (
    <Checkbox
      aria-label="Select all pages shown"
      checked={all}
      indeterminate={!all && ctx.selected.size > 0}
      onCheckedChange={(v) => ctx.setAll(!!v)}
    />
  );
}

function BulkBar({ kind, name, onDone }: { kind: "graph" | "collection"; name: string; onDone: () => void }) {
  const ctx = use(BulkContext)!;
  const [pending, start] = useTransition();
  // A change chosen from a menu waits here until it's confirmed.
  const [staged, setStaged] = useState<{ reach?: Access; read?: ReadAccess; tags?: TagChange; unpublish?: true } | null>(null);
  const n = ctx.selected.size;
  const pages = `${n.toLocaleString("en-US")} ${n === 1 ? "page" : "pages"}`;

  function apply() {
    if (!staged) return;
    const change = staged;
    start(async () => {
      const ids = [...ctx.selected];
      const res = change.unpublish
        ? await bulkUnpublish({ ids })
        : change.tags
          ? await bulkSetTags({ kind, ids, ...change.tags })
          : kind === "graph"
            ? await bulkUpdatePublications({ ids, ...change })
            : await bulkUpdateEntries({ ids, ...change });
      setStaged(null);
      if (!res.ok) return void toast.error(res.message);
      toast.success(res.message);
      onDone();
    });
  }

  const reachOptions: Option<Access>[] = [
    {
      value: "unlisted",
      label: LABELS.unlisted,
      icon: ICONS.unlisted,
      description: "Only people with the link can find them.",
    },
    {
      value: "public",
      label: LABELS.public,
      icon: ICONS.public,
      description: kind === "graph" ? "Listed on your front page." : `Listed on ${name}'s page.`,
    },
    {
      value: "discover",
      label: LABELS.discover,
      icon: ICONS.discover,
      description: "Also on roam.pub/discover. Protected pages are listed instead.",
    },
  ];
  const readChoices: Option<ReadAccess>[] = readOptions(name).map((o) =>
    o.value === "password" ? { ...o, description: `Uses each page's password, or the ${kind}'s.` } : o,
  );

  const stagedOption = staged?.reach
    ? reachOptions.find((o) => o.value === staged.reach)
    : staged?.read
      ? readChoices.find((o) => o.value === staged.read)
      : undefined;

  return (
    <div
      role="toolbar"
      aria-label="Change selected pages"
      className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-card px-3 py-2 shadow-sm"
    >
      <span className="text-sm font-medium tabular-nums">{n.toLocaleString("en-US")} selected</span>
      <BulkMenu label="Where it's listed" disabled={pending}>
        {(close) => (
          <Section
            label="Where they're listed"
            value={"" as Access}
            options={reachOptions}
            onChoose={(reach) => {
              close();
              setStaged({ reach });
            }}
          />
        )}
      </BulkMenu>
      <BulkMenu label="Who can read" disabled={pending}>
        {(close) => (
          <Section
            label="Who can read them"
            value={"" as ReadAccess}
            options={readChoices}
            onChoose={(read) => {
              close();
              setStaged({ read });
            }}
          />
        )}
      </BulkMenu>
      <BulkMenu label="Tags" disabled={pending}>
        {(close) => (
          <TagsPanel
            selectedTags={[...ctx.selected].flatMap((id) => ctx.tags[id] ?? [])}
            onReview={(change) => {
              close();
              setStaged({ tags: change });
            }}
          />
        )}
      </BulkMenu>
      {kind === "graph" && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-destructive"
          disabled={pending}
          onClick={() => setStaged({ unpublish: true })}
        >
          <Trash2Icon /> Unpublish
        </Button>
      )}
      <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={onDone} disabled={pending}>
        <XIcon /> Clear
      </Button>
      <Dialog open={staged !== null} onOpenChange={(o) => !o && !pending && setStaged(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{staged?.unpublish ? `Unpublish ${pages}?` : `Change ${pages}?`}</DialogTitle>
            <DialogDescription>
              {staged?.unpublish && (
                <>Unpublishes {n === 1 ? "it" : "them"} everywhere, including any collections. Links stop working.</>
              )}
              {staged?.tags && <TagChangeSummary change={staged.tags} n={n} />}
              {stagedOption && (
                <>
                  {staged?.reach ? `Sets where ${n === 1 ? "it's" : "they're"} listed` : `Sets who can read ${n === 1 ? "it" : "them"}`}{" "}
                  to <span className="font-medium text-foreground">{stagedOption.label}</span>. {stagedOption.description}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStaged(null)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" variant={staged?.unpublish ? "destructive" : "default"} onClick={apply} disabled={pending}>
              {pending ? "Applying…" : staged?.unpublish ? `Unpublish ${pages}` : `Change ${pages}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BulkMenu({
  label,
  disabled,
  children,
}: {
  label: string;
  disabled: boolean;
  children: (close: () => void) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" disabled={disabled} className="gap-1.5">
            {label}
            <ChevronDownIcon className="opacity-60" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-80 gap-1 p-1">
        {children(() => setOpen(false))}
      </PopoverContent>
    </Popover>
  );
}

type TagChange = { add: string[]; remove: string[] };

const parseTags = (text: string) =>
  [...new Set(text.split(",").map((t) => t.trim().replace(/^#+/, "").replace(/\s+/g, " ").toLowerCase()).filter(Boolean))];

/** Add tags by typing them; remove tags the selected pages have by clicking them. */
function TagsPanel({ selectedTags, onReview }: { selectedTags: string[]; onReview: (change: TagChange) => void }) {
  const [draft, setDraft] = useState("");
  const [remove, setRemove] = useState<Set<string>>(new Set());
  const counts = new Map<string, number>();
  for (const t of selectedTags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const onPages = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const add = parseTags(draft);
  const ready = add.length > 0 || remove.size > 0;
  return (
    <form
      className="flex flex-col gap-3 p-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onReview({ add, remove: [...remove] });
      }}
    >
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Add tags</span>
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="essay, book club" className="h-8" />
      </label>
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Remove from selected pages</span>
        {onPages.length === 0 ? (
          <span className="text-xs text-muted-foreground">The selected pages have no tags.</span>
        ) : (
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
            {onPages.map(([t, n]) => {
              const on = remove.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setRemove((prev) => {
                      const next = new Set(prev);
                      if (on) next.delete(t);
                      else next.add(t);
                      return next;
                    })
                  }
                  className={
                    on
                      ? "inline-flex h-6 items-center gap-1 rounded-4xl border border-destructive bg-destructive/10 px-2 text-xs text-destructive line-through"
                      : "inline-flex h-6 items-center gap-1 rounded-4xl border px-2 text-xs text-roam-ref hover:bg-muted"
                  }
                >
                  #{t} <span className="text-muted-foreground tabular-nums no-underline">{n}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <Button type="submit" size="sm" disabled={!ready} className="self-end">
        <PlusIcon /> Review changes
      </Button>
    </form>
  );
}

function TagChangeSummary({ change, n }: { change: TagChange; n: number }) {
  const list = (ts: string[]) => ts.map((t) => `#${t}`).join(", ");
  return (
    <>
      {change.add.length > 0 && (
        <>
          Adds <span className="font-medium text-foreground">{list(change.add)}</span>
          {change.remove.length > 0 ? " and removes " : ". "}
        </>
      )}
      {change.remove.length > 0 && (
        <>
          {change.add.length === 0 && "Removes "}
          <span className="font-medium text-foreground">{list(change.remove)}</span>.{" "}
        </>
      )}
      Tags belong to the page, so this changes {n === 1 ? "it" : "them"} everywhere {n === 1 ? "it appears" : "they appear"}. Tags
      removed from the Roam text stay removed when republished.
    </>
  );
}
