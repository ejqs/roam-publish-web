"use client";

import { ChevronRightIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A block row whose children can be folded away, like Roam's caret. Folded children stay in the page
 * (`hidden="until-found"`), so find-in-page still reaches them and unfolds the block.
 */
export function CollapsibleRow({
  className,
  caretClassName,
  children,
  nested,
}: {
  className: string;
  /** Vertical position of the caret, centred on the block's first line. */
  caretClassName?: string;
  children: ReactNode;
  /** The block's children. */
  nested: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const open = () => setCollapsed(false);
    el?.addEventListener("beforematch", open);
    return () => el?.removeEventListener("beforematch", open);
  }, []);
  // React has no "until-found" value for `hidden` yet, so it's set directly.
  useEffect(() => {
    if (collapsed) ref.current?.setAttribute("hidden", "until-found");
    else ref.current?.removeAttribute("hidden");
  }, [collapsed]);
  return (
    <li className={className} data-collapsed={collapsed || undefined}>
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand block" : "Collapse block"}
        onClick={() => setCollapsed((c) => !c)}
        className={cn(
          "absolute -left-[1em] flex size-[1.25em] items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity",
          "hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring",
          // Shown while the pointer is on this block's own line (not its children), and always on touch screens.
          "[li:has(>[data-line]:hover)>&]:opacity-100 [@media(hover:none)]:opacity-60",
          collapsed && "opacity-100 [@media(hover:none)]:opacity-100",
          caretClassName ?? "top-[calc(0.175em_+_2px)]",
        )}
      >
        <ChevronRightIcon className={cn("size-[1em] transition-transform", !collapsed && "rotate-90")} />
      </button>
      {children}
      <div ref={ref}>
        {nested}
      </div>
    </li>
  );
}
