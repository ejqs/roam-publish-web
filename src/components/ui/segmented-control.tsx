"use client";

import type { LucideProps } from "lucide-react";
import { type ComponentType, useRef } from "react";
import { cn } from "cn";

export type Segment<T extends string> = {
  value: T;
  label: string;
  icon?: ComponentType<LucideProps>;
  /** Why it can't be chosen right now; shown as its tooltip. */
  disabled?: string;
};

/**
 * One choice from a few, as a row of pressed-in buttons (a radio group). Arrow keys move between
 * the choices that can be picked; a disabled one stays focusable by mouse hover only, for its reason.
 */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  disabled,
  className,
  defaultValue,
  defaultLabel = "default",
  ...aria
}: {
  value: T;
  options: Segment<T>[];
  onChange: (v: T) => void;
  disabled?: boolean;
  className?: string;
  /** The choice something else starts as (a graph's or collection's default), tagged in its segment. */
  defaultValue?: T;
  defaultLabel?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const usable = options.filter((o) => !o.disabled);
    const i = usable.findIndex((o) => o.value === value);
    const next = usable[(i + step + usable.length) % usable.length];
    if (!next || next.value === value) return;
    onChange(next.value);
    ref.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus();
  }

  return (
    <div
      ref={ref}
      role="radiogroup"
      {...aria}
      onKeyDown={onKeyDown}
      className={cn("flex flex-wrap gap-0.5 rounded-sm bg-muted p-0.5", disabled && "opacity-60", className)}
    >
      {options.map((o) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            data-value={o.value}
            aria-checked={on}
            aria-disabled={!!o.disabled || disabled || undefined}
            tabIndex={on ? 0 : -1}
            title={o.disabled}
            onClick={() => !on && !o.disabled && !disabled && onChange(o.value)}
            className={cn(
              "inline-flex h-7 flex-auto items-center justify-center gap-1.5 rounded-sm px-2.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-3.5 [&_svg]:shrink-0",
              on
                ? "bg-card text-foreground shadow-[inset_0_0_0_1px_rgba(17,20,24,0.2),0_1px_2px_rgba(17,20,24,0.1)] dark:bg-input/40"
                : "hover:bg-accent hover:text-foreground",
              o.disabled && !on && "cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground",
            )}
          >
            {Icon && <Icon aria-hidden />}
            <span>{o.label}</span>
            {o.value === defaultValue && (
              <span className="rounded-4xl px-1 text-[11px] leading-4 font-medium text-muted-foreground shadow-[inset_0_0_0_1px_var(--color-border)]">
                {defaultLabel}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
