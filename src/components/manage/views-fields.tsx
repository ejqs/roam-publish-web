"use client";

import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import type { PlaceViews, ViewsMode } from "@/db/schema";
import { viewsMode } from "@/lib/views";
import { Choice, type ChoiceOption } from "./choice";

export const VIEWS_LABELS: Record<ViewsMode, string> = {
  show: "Show",
  hide: "Only people who manage the page",
  off: "Off",
};

export const VIEWS_DESCRIPTIONS: Record<ViewsMode, string> = {
  show: "Listed pages show their count. Unlisted pages show theirs only when set to.",
  hide: "Visitors see nothing. You see the count with a crossed-out eye.",
  off: "No counts for anyone, and views aren't looked up. Managers can turn them back on from the page.",
};

/**
 * A page's own view count choices. "Use …'s setting" names what inheriting means here: an unlisted
 * page keeps its count to its managers even when its graph or collection shows counts.
 */
export function placeViewsOptions(container: { label: string; views: ViewsMode }, listed: boolean) {
  const inherited = viewsMode(container, { views: "inherit" }, listed);
  const options: { value: PlaceViews; label: string; short: string; description?: string }[] = [
    {
      value: "inherit",
      label: `Use ${container.label}'s setting (${inherited === "hide" ? "managers only" : VIEWS_LABELS[inherited].toLowerCase()})`,
      short: `${container.label}'s setting`,
      description: !listed && container.views === "show" ? "Unlisted pages show their count only when set to Show." : undefined,
    },
    { value: "show", label: "Show", short: "Show", description: "Everyone sees the count." },
    { value: "hide", label: "Only people who manage it", short: "Managers only", description: "Visitors see nothing; you see it with a crossed-out eye." },
    { value: "off", label: "Off", short: "Off", description: "No count for anyone, and views aren't looked up." },
  ];
  return options;
}

/** A graph's or collection's view count settings. Pages can override both. */
export function ContainerViewsFields({
  kind,
  views,
  countries,
  onChange,
}: {
  kind: "graph" | "collection";
  views: ViewsMode;
  countries: boolean;
  onChange: (v: { views: ViewsMode; countries: boolean }) => void;
}) {
  const options: ChoiceOption<ViewsMode>[] = (["show", "hide", "off"] as const).map((value) => ({
    value,
    label: VIEWS_LABELS[value],
    description: VIEWS_DESCRIPTIONS[value],
  }));
  return (
    <>
      <FieldSet>
        <FieldLegend variant="label">View counts</FieldLegend>
        <FieldDescription>
          How many times each page in this {kind} was read, from Umami and signed-in Roam readers. Pages can override
          this.
        </FieldDescription>
        <Choice id={`${kind}-views`} value={views} options={options} onChange={(v) => onChange({ views: v, countries })} />
      </FieldSet>
      <Field orientation="horizontal" data-disabled={views !== "show"}>
        <FieldContent>
          <FieldLabel htmlFor={`${kind}-view-countries`}>Show reader countries</FieldLabel>
          <FieldDescription>
            Flags of the top countries next to the count. Countries with fewer than 3 views are grouped as Other.
          </FieldDescription>
        </FieldContent>
        <Switch
          id={`${kind}-view-countries`}
          checked={countries}
          disabled={views !== "show"}
          onCheckedChange={(c) => onChange({ views, countries: c })}
        />
      </Field>
    </>
  );
}
