"use client";

import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** A parent's "fold or unfold all my children" click, passed down to its child rows. */
type FoldAll = { collapsed: boolean };
const FoldAllContext = createContext<FoldAll | null>(null);
const SetPageFoldContext = createContext<((f: FoldAll) => void) | null>(null);

/** Lets {@link PageThread} fold or open the page's top-level blocks. */
export function FoldAllRoot({ children }: { children: ReactNode }) {
  const [fold, setFold] = useState<FoldAll | null>(null);
  return (
    <SetPageFoldContext.Provider value={setFold}>
      <FoldAllContext.Provider value={fold}>{children}</FoldAllContext.Provider>
    </SetPageFoldContext.Provider>
  );
}

/**
 * The page's own thread line, left of its top-level bullets, like the line under any block with children: clicking
 * it folds every top-level block if any is open, otherwise opens them all.
 */
export function PageThread({ children }: { children: ReactNode }) {
  const setFold = useContext(SetPageFoldContext);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className="relative [&:has(>[data-thread]:hover)>:is(ul,ol)]:rounded-sm [&:has(>[data-thread]:hover)>:is(ul,ol)]:bg-muted/60"
    >
      <button
        type="button"
        data-thread
        tabIndex={-1}
        aria-label="Fold or unfold all blocks"
        title="Fold or unfold all blocks"
        onClick={() => {
          const rows = [...(ref.current?.querySelectorAll(":scope > * > li > button[aria-expanded]") ?? [])];
          setFold?.({ collapsed: rows.some((b) => b.getAttribute("aria-expanded") === "true") });
        }}
        // Outside the top-level carets, so only where the page has room beside it.
        className="group absolute inset-y-0 -left-[1.875em] z-10 hidden w-[0.75em] cursor-pointer md:block"
      >
        <span className="absolute inset-y-0 left-1/2 w-px bg-roam-thread group-hover:bg-roam-bullet" />
      </button>
      {children}
    </div>
  );
}

/**
 * A block row whose children can be folded away, like Roam's caret. Folded children stay in the page
 * (`hidden="until-found"`), so find-in-page still reaches them and unfolds the block.
 */
export function CollapsibleRow({
  id,
  className,
  caretClassName,
  children,
  nested,
  defaultCollapsed = false,
}: {
  id?: string;
  className: string;
  /** Vertical position of the caret, centred on the block's first line. */
  caretClassName?: string;
  children: ReactNode;
  /** The block's children. */
  nested: ReactNode;
  /** Start folded, as the block is in Roam. */
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [childrenFold, setChildrenFold] = useState<FoldAll | null>(null);
  // Follow the parent's thread-line click (React's "adjust state when a prop changes" pattern).
  const foldAll = useContext(FoldAllContext);
  const [seenFoldAll, setSeenFoldAll] = useState(foldAll);
  if (foldAll !== seenFoldAll) {
    setSeenFoldAll(foldAll);
    if (foldAll) setCollapsed(foldAll.collapsed);
  }
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const open = () => setCollapsed(false);
    el?.addEventListener("beforematch", open);
    return () => el?.removeEventListener("beforematch", open);
  }, []);
  // React renders `hidden` as plain hidden (so folded blocks arrive folded); after that it becomes
  // "until-found", which React has no value for yet, so find-in-page can still open them.
  useEffect(() => {
    if (collapsed) ref.current?.setAttribute("hidden", "until-found");
    else ref.current?.removeAttribute("hidden");
  }, [collapsed]);
  return (
    <li id={id} className={className} data-collapsed={collapsed || undefined}>
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand block" : "Collapse block"}
        onClick={() => setCollapsed((c) => !c)}
        className={cn(
          "absolute -left-[1em] flex size-[1.25em] items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity",
          "hover:bg-muted hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring",
          // Shown while the pointer is on this block's own line or bullet (not its children), and always on touch screens.
          "[li:has(>:is([data-line],a):hover)>&]:opacity-100 [@media(hover:none)]:opacity-60",
          collapsed && "opacity-100 [@media(hover:none)]:opacity-100",
          caretClassName ?? "top-[calc(0.175em_+_2px)]",
        )}
      >
        {/* Roam's caret: a small solid triangle, pointing down while open. */}
        <svg viewBox="0 0 8 8" aria-hidden className={cn("size-[0.5em] fill-current transition-transform", !collapsed && "rotate-90")}>
          <path d="M2 0.5 7 4 2 7.5Z" />
        </svg>
      </button>
      {children}
      <div
        ref={ref}
        hidden={collapsed || undefined}
        className={cn(
          "relative",
          // Hovering the thread line marks the children it folds, like Roam.
          "[&:has(>[data-thread]:hover)>:is(ul,ol)]:rounded-sm [&:has(>[data-thread]:hover)>:is(ul,ol)]:border-roam-bullet [&:has(>[data-thread]:hover)>:is(ul,ol)]:bg-muted/60",
        )}
      >
        <button
          type="button"
          data-thread
          tabIndex={-1}
          aria-label="Fold or unfold all children"
          title="Fold or unfold all children"
          onClick={() => {
            // Like Roam: fold the children if any is open, otherwise open them all. When none of them has
            // children to fold, the line folds this block instead, so pressing it always does something.
            const rows = [...(ref.current?.querySelectorAll(":scope > * > li > button[aria-expanded]") ?? [])];
            if (!rows.length) return setCollapsed(true);
            setChildrenFold({ collapsed: rows.some((b) => b.getAttribute("aria-expanded") === "true") });
          }}
          className="absolute inset-y-0 -left-[1.625em] z-10 w-[0.75em] cursor-pointer"
        />
        <FoldAllContext.Provider value={childrenFold}>{nested}</FoldAllContext.Provider>
      </div>
    </li>
  );
}
