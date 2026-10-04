"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};
const utcFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * When a release went live: the day, plus the time in the reader's own zone when it's known (backfilled
 * entries only have a day). The server doesn't know the reader's zone, so it renders the UTC day and the
 * browser fills in the rest.
 */
export function ReleaseTime({ iso, withTime }: { iso: string; withTime: boolean }) {
  const browser = useSyncExternalStore(noop, () => true, () => false);
  const d = new Date(iso);
  if (!browser || !withTime) return <time dateTime={iso}>{utcFmt.format(d)}</time>;
  return (
    <time dateTime={iso} className="flex flex-col">
      <span>{d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
      <span className="text-xs">{d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
    </time>
  );
}
