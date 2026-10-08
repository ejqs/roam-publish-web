import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { extAtLeast, installsOf, readyFor } from "@/lib/ext-version";
import { UPCOMING, type Upcoming } from "@/lib/upcoming";
import { viewerId } from "@/lib/viewer";
import { liveExtVersion } from "@/lib/whats-new";
import { ChangeText } from "../change-text";

export const metadata: Metadata = {
  title: "Upcoming changes · Roam Publish",
  description: "Changes to roam.pub that will need you to do something, announced before they happen.",
};

const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** How close it is: whether the extension it needs is out, and how many installs have it. */
async function Readiness({ u, live }: { u: Upcoming; live: string | null }) {
  if (!extAtLeast(live, u.extension))
    return (
      <p className="text-sm text-muted-foreground">
        Extension {u.extension} isn&apos;t on Roam Depot yet. This won&apos;t happen until it is and everyone has updated.
      </p>
    );
  const { ready, total } = await readyFor(u.extension);
  const pct = total ? Math.floor((ready / total) * 100) : 100;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm text-muted-foreground">
        {ready === total
          ? `Every extension in use is on ${u.extension} or newer, so this can happen with the next release.`
          : `${pct}% of the extensions in use are on ${u.extension} or newer. It happens once they all are.`}
      </p>
      <div className="h-1.5 overflow-hidden rounded-sm bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Extensions updated">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** For someone signed in: which of their graphs' extensions are ready. */
function Yours({ u, installs }: { u: Upcoming; installs: { graph: string; version: string | null }[] }) {
  if (!installs.length) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {installs.map((i) => {
        const ok = extAtLeast(i.version, u.extension);
        return (
          <li key={i.graph} className="flex flex-wrap gap-x-2">
            <span className="font-medium">{i.graph}</span>
            <span className="text-muted-foreground">extension {i.version ?? "older than 0.2.0"}</span>
            <span className={ok ? "text-chart-2" : "text-destructive"}>{ok ? "Ready" : "Needs an update"}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default async function UpcomingPage() {
  const [live, me] = await Promise.all([liveExtVersion(), viewerId()]);
  const installs = me ? await installsOf(me) : [];

  return (
    <>
      <SiteHeader />
      <main className="flex-1 px-3 py-4 sm:px-4 sm:py-12">
        <article className="mx-auto flex w-full max-w-[760px] flex-col gap-6 rounded-sm bg-card px-5 py-8 shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_1px_1px_rgba(17,20,24,0.2)] sm:px-10 sm:py-10">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">Upcoming changes</h1>
            <p className="text-sm text-muted-foreground">
              Changes that will need you to do something, announced before they happen. Once one happens, it moves to{" "}
              <Link href="/updates?kind=breaking" className="text-link hover:underline">
                What&apos;s new
              </Link>
              .
            </p>
          </div>

          {UPCOMING.length === 0 && <p className="text-sm text-muted-foreground">Nothing planned right now.</p>}

          {UPCOMING.map((u) => (
            <section key={u.id} id={u.id} className="flex flex-col gap-3 border-t pt-5">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold">
                  <span className="mr-2 rounded-sm bg-destructive/10 px-1 align-middle text-xs font-semibold tracking-wide text-destructive uppercase">
                    Breaking
                  </span>
                  {u.title}
                </h2>
                <p className="text-xs text-muted-foreground">
                  In roam.pub {u.version} · announced {dayFmt.format(new Date(u.announced))}
                </p>
              </div>
              <p className="text-[15px] leading-relaxed">
                <ChangeText text={u.text} />
              </p>
              <div className="flex flex-col gap-1 rounded-sm border-l-2 border-primary bg-primary/5 px-3 py-2">
                <p className="text-sm font-semibold">What to do</p>
                <p className="text-sm leading-relaxed">
                  <ChangeText text={u.action} />
                </p>
                <Yours u={u} installs={installs} />
              </div>
              <Readiness u={u} live={live} />
            </section>
          ))}
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
