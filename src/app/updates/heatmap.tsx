"use client";

import Link from "next/link";
import { useState } from "react";
import { cn } from "cn";
import type { HeatDay } from "@/lib/whats-new-pages";

const LEVEL = ["bg-muted", "bg-primary/25", "bg-primary/50", "bg-primary/75", "bg-primary"] as const;
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });

const changes = (n: number) => (n === 0 ? "No changes" : `${n} change${n === 1 ? "" : "s"}`);

/** "Website 0.6.0 to 0.7.3" for a run of one source's versions on the same day. */
function versionLabel(versions: string[]) {
  const bySource = new Map<string, string[]>();
  for (const v of versions) {
    const [source, version] = [v.slice(0, v.lastIndexOf(" ")), v.slice(v.lastIndexOf(" ") + 1)];
    bySource.set(source, [...(bySource.get(source) ?? []), version]);
  }
  return [...bySource].map(([source, vs]) => (vs.length > 2 ? `${source} ${vs.at(-1)} to ${vs[0]}` : `${source} ${vs.join(", ")}`));
}

const describe = (d: HeatDay) => [dayFmt.format(d.day), changes(d.count), ...versionLabel(d.versions)].join(" · ");

/**
 * Changes per day, one column per week, Monday at the top. A day with changes links to them; pointing at a day
 * shows its date, count and versions underneath.
 */
export function Heatmap({ weeks, hrefs }: { weeks: HeatDay[][]; hrefs: Record<string, string> }) {
  const [shown, setShown] = useState<HeatDay | null>(null);
  const total = weeks.flat().reduce((n, d) => n + d.count, 0);
  const cols = { gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 11px))` };
  return (
    <figure className="flex max-w-full flex-col gap-1.5">
      {/* Columns shrink on narrow screens, so every week fits. */}
      <div className="grid gap-x-[3px] text-[11px] leading-none text-muted-foreground" style={cols} aria-hidden>
        {weeks.map((w, i) => {
          const first = w.find((d) => d.day.getUTCDate() === 1);
          return (
            <span key={i} className="overflow-visible whitespace-nowrap">
              {first && i < weeks.length - 1 ? monthFmt.format(first.day) : ""}
            </span>
          );
        })}
      </div>
      <div className="grid grid-flow-col grid-rows-7 gap-[3px]" style={cols}>
        {weeks.flat().map((d) => {
          const label = describe(d);
          const cell = cn("block aspect-square w-full rounded-[2px]", d.future ? "bg-transparent" : LEVEL[d.level]);
          const hover = d.future ? {} : { onMouseEnter: () => setShown(d), onMouseLeave: () => setShown((s) => (s === d ? null : s)) };
          return d.first ? (
            <Link
              key={d.day.getTime()}
              href={hrefs[d.first]}
              aria-label={label}
              onFocus={() => setShown(d)}
              onBlur={() => setShown((s) => (s === d ? null : s))}
              {...hover}
              className={cn(cell, "hover:ring-1 hover:ring-foreground/60 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none")}
            />
          ) : (
            <span key={d.day.getTime()} {...hover} className={cell} />
          );
        })}
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span aria-live="polite" className={cn("tabular-nums", shown && "text-foreground")}>
          {shown ? describe(shown) : `${changes(total)} in the last ${weeks.length} weeks`}
        </span>
        <span className="flex items-center gap-1 text-[11px]" aria-hidden>
          Less
          {LEVEL.map((c) => (
            <span key={c} className={cn("size-[11px] rounded-[2px]", c)} />
          ))}
          More
        </span>
      </figcaption>
    </figure>
  );
}
