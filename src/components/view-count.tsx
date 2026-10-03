import { EyeOff, TriangleAlert } from "lucide-react";
import * as Flags from "country-flag-icons/react/3x2";
import type { ComponentType, SVGProps } from "react";
import { ViewCountPopover } from "@/components/view-count-popover";
import type { ViewCountry } from "@/db/schema";
import type { ViewFooter } from "@/lib/views-data";
import { countryName, FOOTER_FLAGS, formatViews, MIN_SHOWN_VIEWS } from "@/lib/views";

const flagComponents = Flags as unknown as Record<string, ComponentType<SVGProps<SVGSVGElement>> | undefined>;

/** A country's flag, drawn on the server so the flag set never reaches the browser. */
function Flag({ code, label }: { code: string; label?: boolean }) {
  const F = flagComponents[code];
  const className = "h-3 w-[18px] shrink-0 rounded-[1px] shadow-[0_0_0_1px_rgba(17,20,24,0.15)]";
  if (!F) return <span aria-hidden className={`${className} inline-block shadow-[inset_0_0_0_1px_var(--border)]`} />;
  return label ? <F role="img" aria-label={countryName(code)} className={className} /> : <F aria-hidden className={className} />;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function ago(d: Date, now = new Date()) {
  const m = Math.round((now.getTime() - d.getTime()) / 60_000);
  if (m < 60) return m <= 1 ? "just now" : `${m} minutes ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} ${h === 1 ? "hour" : "hours"} ago` : d.toLocaleDateString("en-US", { dateStyle: "medium" });
}

/** "1.4k views" in a page's footer, with the sources and countries on hover. */
export function ViewCount({ v }: { v: ViewFooter }) {
  // Visitors see "< 10 views" on a small public count; managers see the number.
  const vague = v.few && !v.hidden && !v.manager;
  const text = vague ? `< ${MIN_SHOWN_VIEWS} views` : `${formatViews(v.total)} ${v.total === 1 ? "view" : "views"}`;
  const countries = vague ? [] : (v.countries?.filter((c) => c.views > 0) ?? []);
  const flags = v.flags ? countries.filter((c) => c.code !== "other").slice(0, FOOTER_FLAGS) : [];
  return (
    <ViewCountPopover
      label={v.hidden ? `${text}, hidden from visitors` : vague ? `Fewer than ${MIN_SHOWN_VIEWS} views` : text}
      trigger={
        <>
          {v.hidden && <EyeOff className="size-3.5" aria-hidden />}
          <span className="underline decoration-dotted underline-offset-[3px]">{text}</span>
          {flags.length > 0 && (
            <span className="inline-flex items-center gap-[3px]">
              {flags.map((c) => (
                <Flag key={c.code} code={c.code} label />
              ))}
            </span>
          )}
        </>
      }
    >
      {v.hidden ? (
        <p className="flex gap-2 text-foreground">
          <EyeOff className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>Only people who manage this page see this. View counts are hidden from visitors.</span>
        </p>
      ) : (
        v.few && (
          <p className="text-foreground">
            {vague
              ? `Fewer than ${MIN_SHOWN_VIEWS} views so far. The count shows from ${MIN_SHOWN_VIEWS}.`
              : `Visitors see “< ${MIN_SHOWN_VIEWS} views” until it reaches ${MIN_SHOWN_VIEWS}.`}
          </p>
        )
      )}
      {!vague && <Breakdown v={v} countries={countries} divider={v.hidden || v.few} />}
    </ViewCountPopover>
  );
}

/** Both sources, then countries, then what the numbers mean. */
function Breakdown({ v, countries, divider }: { v: ViewFooter; countries: ViewCountry[]; divider: boolean }) {
  return (
    <>
      {divider && <div className="h-px bg-border" />}
      <dl className="flex flex-col gap-1.5">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Visits recorded by Umami</dt>
          <dd className="font-medium tabular-nums">{v.umami.toLocaleString("en-US")}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Signed-in Roam readers</dt>
          <dd className="font-medium tabular-nums">{v.roam.toLocaleString("en-US")}</dd>
        </div>
      </dl>
      {countries.length > 0 && (
        <>
          <div className="h-px bg-border" />
          <div className="flex flex-col gap-1.5">
            <p className="font-medium">Where readers are</p>
            <ul className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5">
              {countries.map((c) => (
                <li key={c.code} className="contents">
                  <Flag code={c.code} />
                  <span>{countryName(c.code)}</span>
                  <span className="text-muted-foreground tabular-nums">{c.views.toLocaleString("en-US")}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
      <div className="h-px bg-border" />
      <p className="text-muted-foreground">
        Umami counts visits; Roam counts people.{v.syncedAt ? ` Updated ${ago(v.syncedAt)}.` : ""}
      </p>
    </>
  );
}

/** For the page's managers: a password-protected page getting more visits than a private page usually does. */
export function PasswordViewsWarning({ v }: { v: ViewFooter }) {
  return (
    <p className="mt-3 flex gap-2 text-xs text-muted-foreground">
      <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
      <span>
        <span className="font-medium text-foreground">Only people who manage this page see this.</span> This
        password-protected page has had {plural(v.umami, "visit", "visits")}, counting people who only saw the password
        prompt. If that&rsquo;s more than you shared it with, change its password.
      </span>
    </p>
  );
}
