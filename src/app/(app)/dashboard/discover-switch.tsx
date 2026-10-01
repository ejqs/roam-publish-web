"use client";

import { useId, useOptimistic, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { setDiscoverable } from "./actions";

/** Per-page Discover listing. Only this switch changes it once the page exists. */
export function DiscoverSwitch({
  publicationId,
  discoverable,
  disabledReason,
}: {
  publicationId: string;
  discoverable: boolean;
  /** Why the graph can't list anything on Discover right now, if it can't. */
  disabledReason?: string;
}) {
  const id = useId();
  const [optimistic, setOptimistic] = useOptimistic(discoverable);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title={disabledReason}>
      <Switch
        id={id}
        size="sm"
        checked={optimistic}
        disabled={pending || !!disabledReason}
        onCheckedChange={(next) =>
          start(async () => {
            setOptimistic(next);
            await setDiscoverable(publicationId, next);
          })
        }
      />
      <label htmlFor={id}>{optimistic ? "On Discover" : "Not on Discover"}</label>
    </div>
  );
}
