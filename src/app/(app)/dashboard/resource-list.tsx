"use client";

import { ChevronRightIcon, MoreHorizontalIcon } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "cn";

/** Who can see pages, as the ladder names it. The open rungs are blues, a step darker per rung. */
export type Level = "discover" | "listed" | "unlisted" | "password" | "members" | "removed";

const LEVEL_FILL: Record<Level, string> = {
  discover: "bg-[#215db0] dark:bg-[#8abbff]",
  listed: "bg-[#8abbff] dark:bg-[#215db0]",
  unlisted: "bg-[#c5cbd3] dark:bg-[#5f6b7c]",
  password: "bg-[#fbd065] dark:bg-[#c87619]",
  members: "bg-[#d69fd6] dark:bg-[#9d3f9d]",
  removed: "bg-destructive",
};
const LEVEL_LABELS: Record<Level, string> = {
  discover: "Discover",
  listed: "Public",
  unlisted: "Unlisted",
  password: "Password",
  members: "Members",
  removed: "Removed",
};

/** The ladder's levels, for the legend. */
export const RUNG_LEVELS: Level[] = ["discover", "listed", "unlisted", "password", "members"];

export type Segment = { level: Level; n: number; href?: string; title?: string; suffix?: string };

export type ResourceItem = {
  id: string;
  anchor: string;
  name: string;
  manageHref: string;
  /** Owner or Member. */
  role: string;
  badges?: ReactNode;
  total: number;
  segments: Segment[];
  /** Public page (front page / collection) when it exists, with an absolute URL to copy. */
  view?: { href: string; url: string; label: string };
  membersHref: string;
  settingsHref?: string;
  canManage: boolean;
  /** Alerts and hints, shown in a full-width row under this one. */
  note?: ReactNode;
};

const menuItem = "rounded-md px-2 py-1.5 text-sm hover:bg-muted";

const fmt = (n: number) => n.toLocaleString("en-US");

/** A thin bar split by who can see the pages, with the non-zero counts under it. */
function VisibilityBar({ total, segments }: { total: number; segments: Segment[] }) {
  const shown = segments.filter((s) => s.n > 0);
  if (!total || !shown.length) return <span className="text-muted-foreground/50">–</span>;
  const sum = shown.reduce((a, s) => a + s.n, 0);
  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="img"
        aria-label={shown.map((s) => `${fmt(s.n)} ${LEVEL_LABELS[s.level].toLowerCase()}`).join(", ")}
        className="flex h-1.5 overflow-hidden rounded-[1px] bg-muted"
      >
        {shown.map((s) => (
          <span key={s.level} className={LEVEL_FILL[s.level]} style={{ width: `${(s.n / sum) * 100}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-xs text-muted-foreground">
        {shown.map((s) => {
          const text = `${fmt(s.n)} ${LEVEL_LABELS[s.level].toLowerCase()}${s.suffix ?? ""}`;
          const cls = s.level === "removed" ? "text-destructive" : "text-link";
          return s.href ? (
            <Link key={s.level} href={s.href} title={s.title} className={cn(cls, "hover:underline")}>
              {text}
            </Link>
          ) : (
            <span key={s.level} title={s.title}>
              {text}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** The colour key for the bars, shown under a section title. */
export function LevelLegend({ levels = RUNG_LEVELS }: { levels?: Level[] }) {
  return (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted-foreground">
      {levels.map((l) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className={cn("size-2 rounded-[1px]", LEVEL_FILL[l])} />
          {LEVEL_LABELS[l]}
        </span>
      ))}
    </div>
  );
}

/** One bordered table per kind of thing: name, visibility, page count, actions on the right. */
export function ResourceList({
  title,
  nameLabel,
  description,
  action,
  items,
}: {
  title: string;
  nameLabel: string;
  /** Under the title, e.g. the legend. */
  description?: ReactNode;
  /** A button beside the title, e.g. "Connect graph". */
  action?: ReactNode;
  items: ResourceItem[];
}) {
  return (
    <section className="flex flex-col gap-2.5" aria-label={title}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {description}
        </div>
        {action}
      </div>
      {items.length > 0 && (
        <div className="rounded-sm bg-card shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_1px_1px_rgba(17,20,24,0.2)]">
          <Table>
            <TableHeader>
              <TableRow className="text-xs">
                <TableHead className="w-full">{nameLabel}</TableHead>
                <TableHead className="hidden min-w-56 sm:table-cell">Visibility</TableHead>
                <TableHead className="text-right">Pages</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <Fragment key={it.id}>
                  <TableRow id={it.anchor} className={cn("scroll-mt-4", it.note && "border-b-0")}>
                    <TableCell className="max-w-0 py-3">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <Link href={it.manageHref} className="truncate font-semibold hover:underline">
                            {it.name}
                          </Link>
                          {it.badges}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          {it.role}
                          {it.view && (
                            <>
                              {" · "}
                              <Link href={it.view.href} className="text-link hover:underline">
                                {it.view.label}
                              </Link>
                              <CopyButton
                                text={it.view.url}
                                label={`Copy link to ${it.name}`}
                                variant="ghost"
                                size="icon-xs"
                              />
                            </>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden py-3 sm:table-cell">
                      <VisibilityBar total={it.total} segments={it.segments} />
                    </TableCell>
                    <TableCell className="py-3 text-right font-semibold tabular-nums">
                      {it.total ? fmt(it.total) : <span className="font-normal text-muted-foreground/50">–</span>}
                    </TableCell>
                    <TableCell className="py-3 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        {it.canManage && (
                          <Link href={it.manageHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
                            Manage
                            <ChevronRightIcon />
                          </Link>
                        )}
                        {!it.canManage && (
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
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {it.note && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={4} className="pt-0 whitespace-normal">
                        <div className="flex flex-col gap-2">{it.note}</div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
