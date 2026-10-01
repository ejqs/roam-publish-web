import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { Fragment } from "react";
import { cn } from "cn";

export type Crumb = { label: React.ReactNode; href?: string };

/** Muted trail above a page title. The last crumb is the current page. */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  if (items.length < 2) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn("mb-2 text-sm text-muted-foreground", className)}>
      <ol className="flex min-w-0 flex-wrap items-center gap-1">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <Fragment key={i}>
              {i > 0 && (
                <li aria-hidden className="shrink-0">
                  <ChevronRightIcon className="size-3.5" />
                </li>
              )}
              <li className="max-w-full min-w-0 truncate" aria-current={last ? "page" : undefined}>
                {c.href && !last ? (
                  <Link href={c.href} className="hover:text-foreground hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  c.label
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
