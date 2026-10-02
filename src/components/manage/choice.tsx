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

export { ACCESS_DESCRIPTIONS, ACCESS_LABELS, LISTING_LABELS, readOptions } from "./labels";
