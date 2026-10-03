"use client";

import { XIcon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { DISMISS_COOKIE } from "@/lib/announcement-shared";

/** A warning banner with a close button. The cookie keeps it closed until a different one goes up. */
export function DismissibleBanner({
  id,
  className,
  innerClassName,
  preview,
  children,
}: {
  id: string;
  className: string;
  innerClassName: string;
  preview?: boolean;
  children: ReactNode;
}) {
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  return (
    <div role={preview ? undefined : "status"} className={className}>
      <div className={innerClassName}>
        {children}
        <button
          type="button"
          aria-label="Dismiss announcement"
          className="-my-0.5 shrink-0 rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() => {
            if (!preview)
              document.cookie = `${DISMISS_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
            setClosed(true);
          }}
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
