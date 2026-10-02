"use client";

import { ChevronDownIcon, XIcon } from "lucide-react";
import { createContext, use, useState, useTransition } from "react";
import { toast } from "sonner";
import { readOptions } from "@/components/manage/labels";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Access as ReadAccess } from "@/db/schema";
import { ICONS, LABELS, type Option, Section } from "./access-menu";
import type { Access } from "./actions";
import { bulkUpdatePublications } from "./place-actions";

type Ctx = {
  selected: Set<string>;
  ids: string[];
  toggle: (id: string, on: boolean) => void;
  setAll: (on: boolean) => void;
};
const BulkContext = createContext<Ctx | null>(null);

/**
 * Selection for the dashboard's page list: a checkbox per page the viewer can manage, and a bar to
 * change where the checked pages are listed or who can read them.
 */
export function BulkSelect({
  ids,
  graphName,
  children,
}: {
  /** Pages on this page of the list that can be selected. */
  ids: string[];
  graphName: string;
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const ctx: Ctx = {
    selected,
    ids,
    toggle: (id, on) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      }),
    setAll: (on) => setSelected(on ? new Set(ids) : new Set()),
  };
  return (
    <BulkContext value={ctx}>
      {selected.size > 0 && <BulkBar graphName={graphName} onDone={() => setSelected(new Set())} />}
      {children}
    </BulkContext>
  );
}

export function RowCheckbox({ id, title }: { id: string; title: string }) {
  const ctx = use(BulkContext);
  if (!ctx) return null;
  return (
    <Checkbox
      aria-label={`Select ${title}`}
      checked={ctx.selected.has(id)}
      onCheckedChange={(v) => ctx.toggle(id, !!v)}
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

function BulkBar({ graphName, onDone }: { graphName: string; onDone: () => void }) {
  const ctx = use(BulkContext)!;
  const [pending, start] = useTransition();
  const n = ctx.selected.size;

  function apply(change: { reach?: Access; read?: ReadAccess }) {
    start(async () => {
      const res = await bulkUpdatePublications({ ids: [...ctx.selected], ...change });
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
    { value: "public", label: LABELS.public, icon: ICONS.public, description: "Listed on your front page." },
    {
      value: "discover",
      label: LABELS.discover,
      icon: ICONS.discover,
      description: "Also on roam.pub/discover. Protected pages are listed instead.",
    },
  ];
  const readChoices: Option<ReadAccess>[] = readOptions(graphName).map((o) =>
    o.value === "password" ? { ...o, description: "Uses each page's password, or the graph's." } : o,
  );

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
              apply({ reach });
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
              apply({ read });
            }}
          />
        )}
      </BulkMenu>
      <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground" onClick={onDone} disabled={pending}>
        <XIcon /> Clear
      </Button>
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
