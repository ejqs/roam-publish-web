import { ChevronRightIcon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonVariants } from "@/components/ui/button";

export type Stat = { label: string; href?: string; tone?: "destructive"; title?: string };

export type ResourceItem = {
  id: string;
  anchor: string;
  name: string;
  manageHref: string;
  badges?: ReactNode;
  /** Headline count, e.g. "8 published". */
  summary: Stat;
  /** Secondary counts; zero counts should be left out by the caller. */
  stats?: Stat[];
  /** Public page (front page / collection) when it exists. */
  viewHref?: string;
  viewLabel: string;
  membersHref: string;
  settingsHref?: string;
  /** Shown to the right of Manage; omit when there is nothing to manage. */
  canManage: boolean;
  note?: ReactNode;
};

function StatLink({ s }: { s: Stat }) {
  const cls = `tabular-nums ${s.tone === "destructive" ? "text-destructive" : ""}`;
  return s.href ? (
    <Link href={s.href} title={s.title} className={`${cls} hover:text-foreground hover:underline`}>
      {s.label}
    </Link>
  ) : (
    <span title={s.title} className={cls}>
      {s.label}
    </span>
  );
}

/** One bordered list per kind of thing, one row each: name and counts left, actions right. */
export function ResourceList({ title, items }: { title: string; items: ResourceItem[] }) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="px-1 text-sm font-medium text-muted-foreground">{title}</h2>
      <ul className="divide-y rounded-xl border bg-card">
        {items.map((it) => (
          <li key={it.id} id={it.anchor} className="scroll-mt-4 flex flex-col gap-2 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <Link href={it.manageHref} className="truncate font-medium hover:underline">
                    {it.name}
                  </Link>
                  {it.badges}
                  {it.viewHref && (
                    <Link
                      href={it.viewHref}
                      aria-label={it.viewLabel}
                      title={it.viewLabel}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLinkIcon className="size-3.5" />
                    </Link>
                  )}
                </div>
                <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
                  <StatLink s={it.summary} />
                  {it.stats?.map((s) => (
                    <span key={s.label} className="contents">
                      <span aria-hidden>·</span>
                      <StatLink s={s} />
                    </span>
                  ))}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Link href={it.membersHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Members
                </Link>
                {it.settingsHref && (
                  <Link href={it.settingsHref} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                    Settings
                  </Link>
                )}
                {it.canManage && (
                  <Link href={it.manageHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Manage pages
                    <ChevronRightIcon />
                  </Link>
                )}
              </div>
            </div>
            {it.note}
          </li>
        ))}
      </ul>
    </section>
  );
}
