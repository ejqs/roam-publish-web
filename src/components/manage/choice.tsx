"use client";

import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type ChoiceOption<T extends string> = { value: T; label: string; description?: string; disabled?: boolean };

/** A labelled radio list for one setting. */
export function Choice<T extends string>({
  id,
  value,
  options,
  onChange,
  disabled,
}: {
  id: string;
  value: T;
  options: ChoiceOption<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <RadioGroup value={value} onValueChange={(v) => onChange(v as T)} disabled={disabled} className="gap-3">
      {options.map((o) => (
        <Field key={o.value} orientation="horizontal" data-disabled={o.disabled || disabled}>
          <RadioGroupItem value={o.value} id={`${id}-${o.value}`} disabled={o.disabled} />
          <FieldContent>
            <FieldLabel htmlFor={`${id}-${o.value}`} className="font-normal">
              {o.label}
            </FieldLabel>
            {o.description && <FieldDescription>{o.description}</FieldDescription>}
          </FieldContent>
        </Field>
      ))}
    </RadioGroup>
  );
}

/** Short names, for badges. Forms use readOptions, which says whose members. */
export const ACCESS_LABELS = { open: "Open", password: "Password", members: "Members only" } as const;
export const ACCESS_DESCRIPTIONS = {
  open: "Anyone with the link can read.",
  password: "Readers enter a password. Unlocking lasts 30 days on that browser.",
  members: "Only signed-in members can read.",
} as const;

/** Where a page is listed, the same words for graphs and collections. */
export const LISTING_LABELS = { unlisted: "Not listed", listed: "Listed", discover: "Discover" } as const;

/**
 * Who can read: a page ("Anyone with the link") or a front page ("Anyone"), with members named
 * after the graph or collection they belong to.
 */
export function readOptions(
  container: string,
  what: "page" | "front page" = "page",
): ChoiceOption<"open" | "password" | "members">[] {
  return [
    {
      value: "open",
      label: what === "page" ? "Anyone with the link" : "Anyone",
      description: what === "page" ? "No sign-in or password needed." : "Anyone can open it.",
    },
    { value: "password", label: "Password", description: ACCESS_DESCRIPTIONS.password },
    {
      value: "members",
      label: `Members of ${container}`,
      description: `Only people invited to publish to ${container}, once signed in.`,
    },
  ];
}
