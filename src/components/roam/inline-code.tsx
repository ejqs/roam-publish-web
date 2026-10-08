"use client";

import { toast } from "sonner";

/** Inline `code` that copies itself when clicked, unless the reader is selecting part of it. */
export function InlineCode({ code }: { code: string }) {
  async function copy() {
    if (window.getSelection()?.toString()) return;
    await navigator.clipboard.writeText(code).catch(() => {});
    toast.success("Copied");
  }
  return (
    <code
      role="button"
      tabIndex={0}
      title="Click to copy"
      onClick={copy}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          copy();
        }
      }}
      className="cursor-copy rounded-sm bg-muted px-1 font-mono text-[0.9em] outline-none hover:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_8%)] focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {code}
    </code>
  );
}
