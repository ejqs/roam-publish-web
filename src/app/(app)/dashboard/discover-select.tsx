"use client";

import { useOptimistic, useTransition } from "react";
import { type Discoverable, setDiscoverable } from "./actions";

/**
 * Per-page Discover listing. "Default" follows the graph setting, shown in the label so the
 * effective state is always visible.
 */
export function DiscoverSelect({
  publicationId,
  value,
  graphDefault,
  disabledReason,
}: {
  publicationId: string;
  value: Discoverable;
  graphDefault: boolean;
  /** Why the graph can't list anything on Discover right now, if it can't. */
  disabledReason?: string;
}) {
  const [optimistic, setOptimistic] = useOptimistic(value);
  const [pending, start] = useTransition();
  return (
    <label className="flex flex-col items-start gap-0.5 text-xs text-muted-foreground">
      Discover
      <select
        title={disabledReason}
        value={optimistic}
        disabled={pending || !!disabledReason}
        onChange={(e) => {
          const next = e.target.value as Discoverable;
          start(async () => {
            setOptimistic(next);
            await setDiscoverable(publicationId, next);
          });
        }}
        className="h-7 rounded-sm border border-input bg-transparent px-1 text-sm text-foreground disabled:opacity-50"
      >
        <option value="default">Default ({graphDefault ? "listed" : "hidden"})</option>
        <option value="on">Listed</option>
        <option value="off">Hidden</option>
      </select>
    </label>
  );
}
