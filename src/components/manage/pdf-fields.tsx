"use client";

import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import {
  PDF_FONT_LABELS,
  PDF_FONTS,
  PDF_PAPER_LABELS,
  PDF_PAPERS,
  PDF_SIZE_LABELS,
  PDF_SIZES,
  type PdfStyle,
} from "@/lib/pdf";

/** What a PDF can carry besides the page itself, in the order they're listed. */
const INCLUDES: { key: "author" | "tags" | "downloaded" | "link" | "pageNumbers" | "threads"; label: string }[] = [
  { key: "author", label: "Author" },
  { key: "tags", label: "Tags" },
  { key: "downloaded", label: "Downloaded date" },
  { key: "link", label: "Page link" },
  { key: "pageNumbers", label: "Page numbers" },
  { key: "threads", label: "Thread lines" },
];

/**
 * Paper, font, text size and what goes in a PDF. The owner's settings and a reader's Download PDF
 * menu both use it; `enforced` isn't part of it.
 */
export function PdfStyleControls({
  style,
  onChange,
  compact,
}: {
  style: PdfStyle;
  onChange: (next: PdfStyle) => void;
  /** The reader's menu: smaller labels, one choice per row. */
  compact?: boolean;
}) {
  const id = useId();
  const set = <K extends keyof PdfStyle>(key: K) => (value: PdfStyle[K]) => onChange({ ...style, [key]: value });
  const label = compact ? "text-xs font-medium text-muted-foreground" : "text-sm font-medium";
  const row = (key: string, text: string, control: React.ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-${key}`} className={label}>
        {text}
      </span>
      {control}
    </div>
  );
  return (
    <div className="flex flex-col gap-3">
      {row(
        "paper",
        "Paper",
        <SegmentedControl
          aria-labelledby={`${id}-paper`}
          value={style.paper}
          options={PDF_PAPERS.map((v) => ({ value: v, label: PDF_PAPER_LABELS[v] }))}
          onChange={set("paper")}
        />,
      )}
      <div className={compact ? "flex flex-col gap-3" : "grid gap-3 sm:grid-cols-2"}>
        {row(
          "font",
          "Font",
          <SegmentedControl
            aria-labelledby={`${id}-font`}
            value={style.font}
            options={PDF_FONTS.map((v) => ({ value: v, label: PDF_FONT_LABELS[v] }))}
            onChange={set("font")}
          />,
        )}
        {row(
          "size",
          "Text size",
          <SegmentedControl
            aria-labelledby={`${id}-size`}
            value={style.size}
            options={PDF_SIZES.map((v) => ({ value: v, label: PDF_SIZE_LABELS[v] }))}
            onChange={set("size")}
          />,
        )}
      </div>
      {row(
        "include",
        "Include",
        <div role="group" aria-labelledby={`${id}-include`} className="grid grid-cols-2 gap-x-4 gap-y-2">
          {INCLUDES.map((o) => (
            <Field key={o.key} orientation="horizontal">
              <Checkbox id={`${id}-${o.key}`} checked={style[o.key]} onCheckedChange={(v) => set(o.key)(!!v)} />
              <FieldLabel htmlFor={`${id}-${o.key}`} className="font-normal">
                {o.label}
              </FieldLabel>
            </Field>
          ))}
        </div>,
      )}
    </div>
  );
}

/**
 * A graph's or collection's PDF download: whether its pages offer it, how the PDFs look, and
 * whether readers may change that look. Pages can override whether they offer it.
 */
export function ContainerPdfFields({
  kind,
  enabled,
  style,
  onChange,
}: {
  kind: "graph" | "collection";
  enabled: boolean;
  style: PdfStyle;
  onChange: (v: { enabled: boolean; style: PdfStyle }) => void;
}) {
  return (
    <>
      <Field orientation="horizontal">
        <FieldContent>
          <FieldLabel htmlFor={`${kind}-pdf`}>PDF download</FieldLabel>
          <FieldDescription>
            Readers get a Download PDF button on this {kind}&apos;s pages, with a layout made for paper. Pages can override
            this. Anyone who can read a page can still print or copy it either way.
          </FieldDescription>
        </FieldContent>
        <Switch id={`${kind}-pdf`} checked={enabled} onCheckedChange={(v) => onChange({ enabled: v, style })} />
      </Field>
      {enabled && (
        <div className="flex flex-col gap-4 rounded-sm border bg-muted/30 p-3">
          <PdfStyleControls style={style} onChange={(s) => onChange({ enabled, style: s })} />
          <Field orientation="horizontal" className="border-t pt-3">
            <FieldContent>
              <FieldLabel htmlFor={`${kind}-pdf-enforced`}>Enforce this style</FieldLabel>
              <FieldDescription>
                {style.enforced
                  ? "Every download looks like this. Readers can only choose how folded blocks print."
                  : "Readers can change these for their own download, starting from your choices."}
              </FieldDescription>
            </FieldContent>
            <Switch
              id={`${kind}-pdf-enforced`}
              checked={style.enforced}
              onCheckedChange={(v) => onChange({ enabled, style: { ...style, enforced: v } })}
            />
          </Field>
        </div>
      )}
    </>
  );
}
