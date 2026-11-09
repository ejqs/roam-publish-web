"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};
const utcFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const localOpts: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
};

/** "Nov 9, 2026, 12:13 PM UTC": what the server renders, the same for every admin. */
export const fmtUtc = (d: Date) => `${utcFmt.format(d)} UTC`;

/**
 * An admin timestamp in UTC, plus the viewer's own time when their zone isn't UTC. The server doesn't
 * know the viewer's zone, so it renders the UTC time alone and the browser adds the local one after
 * hydrating (useSyncExternalStore's server snapshot keeps the first client render identical).
 * `inline` keeps it on one line for sentences, with the local time in a tooltip.
 */
export function AdminTime({ d, inline = false }: { d: Date | string | null | undefined; inline?: boolean }) {
  const browser = useSyncExternalStore(noop, () => true, () => false);
  if (!d) return <>—</>;
  const date = new Date(d);
  const utc = fmtUtc(date);
  const local = browser && date.getTimezoneOffset() !== 0 ? date.toLocaleString("en-US", localOpts) : null;
  if (inline)
    return (
      <time dateTime={date.toISOString()} title={local ?? undefined}>
        {utc}
      </time>
    );
  return (
    <time dateTime={date.toISOString()} className="inline-flex flex-col">
      <span>{utc}</span>
      {local && <span className="text-xs opacity-80">{local}</span>}
    </time>
  );
}
