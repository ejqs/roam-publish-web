"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import { updateEntry, updateGraphPlace } from "@/server/actions/places";
import { placeViewsOptions } from "@/components/manage/views-fields";
import { Switch } from "@/components/ui/switch";
import type { PlaceViews, ShowAuthor } from "@/db/schema";
import type { ViewControlsData } from "@/lib/views-data";
import { showsViewCountries, viewsMode } from "@/lib/views";
import { cn } from "cn";

/**
 * This page's view count settings, inside the count's popover, for people who can change them. The
 * same settings as the access menu's View count and Reader countries; each change saves at once.
 */
export function ViewControls({ c }: { c: ViewControlsData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useOptimistic({ views: c.views, showViewCountries: c.showViewCountries });
  const options = placeViewsOptions(c.container, c.listed);
  const selected = options.find((o) => o.value === state.views)!;
  const showing = viewsMode(c.container, state, c.listed) === "show";
  const countriesOn = showsViewCountries(c.container, state);

  function save(next: { views?: PlaceViews; showViewCountries?: ShowAuthor }) {
    start(async () => {
      setState((s) => ({ ...s, ...next }));
      const res =
        c.target.kind === "graph" ? await updateGraphPlace(c.target.publicationId, next) : await updateEntry(c.target.entryId, next);
      if (!res.ok) return void toast.error(res.message);
      if (next.views === "off") toast.success("View count turned off. You can turn it back on here.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium">Who sees this</p>
      <div role="radiogroup" aria-label="Who sees this page's view count" className="grid grid-cols-2 gap-1">
        {options.map((o) => {
          const on = o.value === state.views;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={o.label}
              title={o.label}
              disabled={pending}
              onClick={() => !on && save({ views: o.value })}
              className={cn(
                "h-7 truncate rounded-sm px-2 text-left text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60",
                on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-accent",
              )}
            >
              {o.short}
            </button>
          );
        })}
      </div>
      {selected.description && <p className="text-muted-foreground">{selected.description}</p>}
      {showing && (
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="view-countries-popover" className="flex flex-col gap-0.5">
            <span>Reader countries</span>
            {state.showViewCountries !== "inherit" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => save({ showViewCountries: "inherit" })}
                className="w-fit text-link hover:underline"
              >
                Use {c.container.label}&apos;s setting
              </button>
            )}
          </label>
          <Switch
            id="view-countries-popover"
            checked={countriesOn}
            disabled={pending}
            onCheckedChange={(v) => save({ showViewCountries: v ? "show" : "hide" })}
          />
        </div>
      )}
    </div>
  );
}
