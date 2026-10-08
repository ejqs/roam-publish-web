import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { cn } from "cn";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { UnseenDot } from "@/components/whats-new-anchor";
import {
  type Entry,
  type Kind,
  KIND_LABEL,
  KINDS,
  newSince,
  parseSeen,
  SEEN_COOKIE,
  seenValue,
  type Source,
  SOURCE_LABEL,
  whatsNew,
} from "@/lib/whats-new";
import { ChangeText } from "./change-text";
import { MarkSeen } from "./mark-seen";
import { ReleaseTime } from "./release-time";

export const metadata: Metadata = {
  title: "What's new · Roam Publish",
  description: "Changes to roam.pub and the Roam Publish extension.",
  alternates: { types: { "application/rss+xml": "/updates/feed.xml" } },
};

const FILTERS: { value: Source | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "web", label: "Website" },
  { value: "ext", label: "Extension" },
];

const KIND_FILTERS: { value: Kind | null; label: string }[] = [{ value: null, label: "All" }, ...KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))];

const KIND_CHIP: Record<Kind, string> = {
  breaking: "rounded-sm bg-destructive/10 px-1 text-destructive",
  new: "text-chart-2",
  improved: "text-link",
  fixed: "text-chart-3",
};

const CHIP: Record<Source, string> = {
  web: "bg-primary/10 text-link",
  ext: "bg-chart-5/15 text-chart-5",
};

/** One group per release: the entries that went live together. */
function byRelease(entries: Entry[]) {
  const groups: { at: Date; entries: Entry[] }[] = [];
  for (const e of entries) {
    const last = groups.at(-1);
    if (last && last.at.getTime() === e.stampedAt.getTime()) last.entries.push(e);
    else groups.push({ at: e.stampedAt, entries: [e] });
  }
  return groups;
}

/** The query string for a filter combination. */
function filterHref(source: Source | null, kind: Kind | null) {
  const q = new URLSearchParams();
  if (source) q.set("source", source);
  if (kind) q.set("kind", kind);
  const s = q.toString();
  return s ? `/updates?${s}` : "/updates";
}

function FilterNav({ label, items }: { label: string; items: { key: string; label: string; href: string; active: boolean }[] }) {
  return (
    <nav aria-label={label} className="flex rounded-sm border text-sm">
      {items.map((f, i) => (
        <Link
          key={f.key}
          href={f.href}
          aria-current={f.active ? "page" : undefined}
          className={cn(
            "px-3 py-1",
            i > 0 && "border-l",
            f.active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {f.label}
        </Link>
      ))}
    </nav>
  );
}

export default async function UpdatesPage(props: PageProps<"/updates">) {
  const sp = await props.searchParams;
  const source = sp.source === "web" || sp.source === "ext" ? sp.source : null;
  const kind = KINDS.find((k) => k === sp.kind) ?? null;
  const [all, jar] = await Promise.all([whatsNew(), cookies()]);
  const fresh = newSince(all, parseSeen(jar.get(SEEN_COOKIE)?.value));
  const entries = all.filter((e) => (!source || e.source === source) && (!kind || e.kind === kind));
  const days = byRelease(entries);
  const firstOld = days.findIndex((d) => !d.entries.some((e) => fresh.has(e.id)));

  return (
    <>
      <SiteHeader />
      <MarkSeen value={seenValue(all)} />
      <main className="flex-1 px-3 py-4 sm:px-4 sm:py-12">
        <article className="mx-auto flex w-full max-w-[760px] flex-col gap-6 rounded-sm bg-card px-5 py-8 shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_1px_1px_rgba(17,20,24,0.2)] sm:px-10 sm:py-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold">What&apos;s new</h1>
              <p className="text-sm text-muted-foreground">
                Changes to roam.pub and the Roam extension.{" "}
                <a href="/updates/feed.xml" className="text-link hover:underline">
                  RSS
                </a>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterNav
                label="Filter by kind"
                items={KIND_FILTERS.map((f) => ({ key: f.label, label: f.label, href: filterHref(source, f.value), active: f.value === kind }))}
              />
              <FilterNav
                label="Filter by source"
                items={FILTERS.map((f) => ({ key: f.label, label: f.label, href: filterHref(f.value, kind), active: f.value === source }))}
              />
            </div>
          </div>

          {fresh.size > 0 && firstOld !== 0 && days.length > 0 && (
            <p className="flex items-center gap-2 text-xs text-primary after:h-px after:flex-1 after:bg-primary/35">
              New since your last visit
            </p>
          )}

          {days.length === 0 && <p className="text-sm text-muted-foreground">Nothing here yet.</p>}

          <div className="flex flex-col">
            {days.map((d, i) => {
              const versions = [...new Set(d.entries.filter((e) => e.version).map((e) => `${SOURCE_LABEL[e.source]} ${e.version}`))];
              return (
                <section
                  key={d.at.toISOString()}
                  className={cn(
                    "grid gap-x-5 gap-y-2 py-5 sm:grid-cols-[7rem_1fr]",
                    i > 0 && (i === firstOld && fresh.size > 0 ? "border-t border-primary/35" : "border-t"),
                  )}
                >
                  <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground tabular-nums sm:flex-col sm:flex-nowrap sm:gap-1">
                    {/* Backfilled entries are stamped with their section's day, so there's no time to show. */}
                    <ReleaseTime iso={d.at.toISOString()} withTime={d.entries.some((e) => e.stampedAt.getTime() !== e.date.getTime())} />
                    {versions.map((v) => (
                      <span key={v} className="font-mono text-xs text-foreground">
                        {v}
                      </span>
                    ))}
                  </div>
                  <ul className="flex min-w-0 flex-col gap-3">
                    {d.entries.map((e) => (
                      <li key={e.id} id={e.id} className="grid grid-cols-[5.5rem_1fr] items-baseline gap-2.5 text-[15px] leading-relaxed">
                        <span className={cn("justify-self-start rounded-4xl px-2 text-xs font-medium whitespace-nowrap", CHIP[e.source])}>
                          {SOURCE_LABEL[e.source]}
                        </span>
                        <p className="min-w-0 break-words">
                          {e.kind && <span className={cn("mr-1.5 text-xs font-semibold tracking-wide uppercase", KIND_CHIP[e.kind])}>{KIND_LABEL[e.kind]}</span>}
                          {e.area && <span className="text-muted-foreground">{e.area}: </span>}
                          <ChangeText text={e.text} />
                          {fresh.has(e.id) && <UnseenDot className="ml-1.5 align-middle" />}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
