import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, FolderIcon } from "lucide-react";
import Link from "next/link";
import { PRIVACY_ICONS } from "@/components/privacy-icons";
import { buttonVariants } from "@/components/ui/button";

export type SectionTab = { href: string; label: string; count?: number };

/** Underlined links between a page's sections. `current` is the href of the one showing. */
export function SectionTabs({ label, tabs, current }: { label: string; tabs: SectionTab[]; current: string }) {
  return (
    <nav aria-label={label} className="flex gap-5 overflow-x-auto overflow-y-hidden border-b text-sm">
      {tabs.map((t) => {
        const active = t.href === current;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 py-2 ${
              active ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="rounded-4xl bg-muted px-1.5 text-xs font-medium text-foreground tabular-nums">{t.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The top of a graph's or collection's dashboard pages: a way back, its name, a line about it,
 * a link to its public page and tabs for Pages, Members and Settings.
 */
export function ResourceHeader({
  name,
  caption,
  view,
  tabs,
  current,
}: {
  name: string;
  caption?: React.ReactNode;
  view?: { href: string; label: string };
  tabs: SectionTab[];
  current: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/dashboard"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeftIcon className="size-3.5" />
        Dashboard
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold break-words">{name}</h1>
          {caption && <div className="text-sm text-muted-foreground">{caption}</div>}
        </div>
        {view && (
          <Link href={view.href} className={buttonVariants({ variant: "outline" })}>
            {view.label}
            <ExternalLinkIcon />
          </Link>
        )}
      </div>
      <SectionTabs label={`${name} sections`} tabs={tabs} current={current} />
    </div>
  );
}

/** Pages, Members and, for owners, Arrange, Sharing (graphs only) and Settings under one graph or collection path. */
export function resourceTabs(base: string, isOwner: boolean, withDefaults = false): SectionTab[] {
  return [
    { href: base, label: "Pages" },
    { href: `${base}/members`, label: "Members" },
    ...(isOwner ? [{ href: `${base}/arrange`, label: "Arrange" }] : []),
    ...(isOwner && withDefaults ? [{ href: `${base}/sharing`, label: "Sharing" }] : []),
    ...(isOwner ? [{ href: `${base}/settings`, label: "Settings" }] : []),
  ];
}

/** Under a graph's or collection's Pages list: its Unlisted pages, which the Unlisted tab lists instead. */
export function UnlistedElsewhere({ n, from, href }: { n: number; from: string; href: string }) {
  if (!n) return null;
  return (
    <Link href={href} className="-mt-2 flex w-fit max-w-full items-center gap-1.5 text-sm text-link hover:underline">
      <PRIVACY_ICONS.unlisted className="size-3.5 shrink-0" />
      <span className="truncate">
        {n.toLocaleString("en-US")} Unlisted {n === 1 ? "page" : "pages"} from {from}
      </span>
      <ChevronRightIcon className="size-3.5 shrink-0" />
    </Link>
  );
}

/** Under a graph's Pages list: its pages only in collections, which have their own page. */
export function OnlyInCollectionsLink({ n, from, href }: { n: number; from: string; href: string }) {
  if (!n) return null;
  return (
    <Link href={href} className="-mt-2 flex w-fit max-w-full items-center gap-1.5 text-sm text-link hover:underline">
      <FolderIcon className="size-3.5 shrink-0" />
      <span className="truncate">
        {n.toLocaleString("en-US")} {n === 1 ? "page" : "pages"} only in collections from {from}
      </span>
      <ChevronRightIcon className="size-3.5 shrink-0" />
    </Link>
  );
}
