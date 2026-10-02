"use client";

import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { ChevronRightIcon, ExternalLinkIcon, MoreHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type Count = { n: number; href?: string; tone?: "destructive"; title?: string; suffix?: string };

export type ResourceItem = {
  id: string;
  anchor: string;
  name: string;
  manageHref: string;
  badges?: ReactNode;
  /** Keyed by the list's column keys; a missing key renders as a dash. */
  counts: Record<string, Count>;
  /** Public page (front page / collection) when it exists. */
  viewHref?: string;
  viewLabel: string;
  membersHref: string;
  settingsHref?: string;
  canManage: boolean;
  /** Alerts and hints, shown in a full-width row under this one. */
  note?: ReactNode;
};

const features = tableFeatures({});
const helper = createColumnHelper<typeof features, ResourceItem>();

const menuItem = "rounded-md px-2 py-1.5 text-sm hover:bg-muted";

const fmt = (n: number) => n.toLocaleString("en-US");

function CountCell({ c }: { c?: Count }) {
  if (!c || c.n === 0) return <span className="text-muted-foreground/50">–</span>;
  const text = `${fmt(c.n)}${c.suffix ?? ""}`;
  const cls = `tabular-nums ${c.tone === "destructive" ? "text-destructive" : ""}`;
  if (!c.href) return <span className={`${cls} text-muted-foreground`}>{text}</span>;
  return (
    <Link href={c.href} title={c.title} className={`${cls} text-link hover:underline`}>
      {text}
    </Link>
  );
}

/** One bordered table per kind of thing: name, one column per count, actions on the right. */
export function ResourceList({
  title,
  nameLabel,
  columns: countColumns,
  items,
}: {
  title: string;
  nameLabel: string;
  /** The first column stays on phones; the rest appear from `sm` up. */
  columns: { key: string; label: string }[];
  items: ResourceItem[];
}) {
  const columns = helper.columns([
    helper.display({
      id: "name",
      header: nameLabel,
      cell: ({ row: { original: it } }) => (
        <div className="flex items-center gap-2">
          <Link href={it.manageHref} className="truncate font-medium hover:underline">
            {it.name}
          </Link>
          {it.badges}
          {it.viewHref && (
            <Link
              href={it.viewHref}
              aria-label={it.viewLabel}
              title={it.viewLabel}
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLinkIcon className="size-3.5" />
            </Link>
          )}
        </div>
      ),
    }),
    ...countColumns.map(({ key, label }) =>
      helper.display({ id: key, header: label, cell: ({ row }) => <CountCell c={row.original.counts[key]} /> }),
    ),
    helper.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row: { original: it } }) => (
        <div className="flex items-center justify-end gap-1">
          {it.canManage && (
            <Link href={it.manageHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Manage pages
              <ChevronRightIcon />
            </Link>
          )}
          <Popover>
            <PopoverTrigger
              render={
                <Button variant="ghost" size="icon-sm" aria-label={`More for ${it.name}`}>
                  <MoreHorizontalIcon />
                </Button>
              }
            />
            <PopoverContent align="end" className="w-40 gap-0.5 p-1">
              <Link href={it.membersHref} className={menuItem}>
                Members
              </Link>
              {it.settingsHref && (
                <Link href={it.settingsHref} className={menuItem}>
                  Settings
                </Link>
              )}
            </PopoverContent>
          </Popover>
        </div>
      ),
    }),
  ]);
  const table = useTable({ features, columns, data: items, getRowId: (it) => it.id });
  if (!items.length) return null;

  const colClass = (id: string) =>
    id === "name" || id === "actions" || id === countColumns[0]?.key
      ? undefined
      : "hidden text-right sm:table-cell";
  const numeric = (id: string) => id !== "name" && id !== "actions";

  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="px-1 text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={`${colClass(header.column.id) ?? (numeric(header.column.id) ? "text-right" : "")} ${header.column.id === "name" ? "w-full" : ""}`}
                  >
                    <table.FlexRender header={header} />
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => {
              const it = row.original;
              return (
                <Fragment key={row.id}>
                  <TableRow id={it.anchor} className={`scroll-mt-4 ${it.note ? "border-b-0" : ""}`}>
                    {row.getAllCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={`${colClass(cell.column.id) ?? (numeric(cell.column.id) ? "text-right" : "")} ${cell.column.id === "name" ? "max-w-0" : "whitespace-nowrap"}`}
                      >
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                  {it.note && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={columns.length} className="pt-0 whitespace-normal">
                        <div className="flex flex-col gap-2">{it.note}</div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
