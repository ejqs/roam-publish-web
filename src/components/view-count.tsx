import { EyeOff, TriangleAlert } from "lucide-react";
import * as Flags from "country-flag-icons/react/3x2";
import type { ComponentType, SVGProps } from "react";
import { ViewControls } from "@/components/view-controls";
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
  if (v.off) return <ViewsOff v={v} />;
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
          <span>This count is private: only you see it. Visitors don&apos;t.</span>
        </p>
      ) : (
        vague && <p className="text-foreground">Fewer than {MIN_SHOWN_VIEWS} views so far.</p>
      )}
      {!vague && <Breakdown v={v} countries={countries} divider={v.hidden} />}
      {v.controls && (
        <>
          <div className="h-px bg-border" />
          <ViewControls c={v.controls} />
        </>
      )}
    </ViewCountPopover>
  );
}

/** A page whose views are off, for someone who can turn them back on. */
function ViewsOff({ v }: { v: ViewFooter }) {
  return (
    <ViewCountPopover
      label="View count off"
      trigger={
        <>
          <EyeOff className="size-3.5" aria-hidden />
          <span className="underline decoration-dotted underline-offset-[3px]">Views off</span>
        </>
      }
    >
      <p className="text-foreground">Views aren&apos;t counted or shown on this page. Only you see this, so you can turn them back on.</p>
      {v.controls && (
        <>
          <div className="h-px bg-border" />
          <ViewControls c={v.controls} />
        </>
      )}
    </ViewCountPopover>
  );
}

/** Both sources, then countries, then what the numbers mean. */
function Breakdown({ v, countries, divider }: { v: ViewFooter; countries: ViewCountry[]; divider: boolean }) {
  return (
    <>
      {divider && <div className="h-px bg-border" />}
      <dl className="flex flex-col gap-1.5">
        {v.unlocks !== null && (
          <Row label="Got in with the password" value={v.unlocks} />
        )}
        <Row
          label="Visits recorded by Umami"
          note={v.unlocks !== null ? "Includes people who only saw the password prompt" : undefined}
          value={v.umami}
        />
        {(v.unlocks === null || v.roam > 0) && <Row label="Signed-in Roam readers" value={v.roam} />}
      </dl>
      {countries.length > 0 && (
        <>
          <div className="h-px bg-border" />
          <div className="flex flex-col gap-1.5">
            <p className="font-medium">{v.unlocks === null ? "Where readers are" : "Where visits come from"}</p>
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
        {v.unlocks === null
          ? "Umami counts visits; Roam counts people."
          : "Only people who got in saw the page. Password entries count from its last change."}
        {v.syncedAt ? ` Visits updated ${ago(v.syncedAt)}.` : ""}
      </p>
    </>
  );
}

function Row({ label, note, value }: { label: string; note?: string; value: number }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">
        {label}
        {note && <span className="block text-[11px] leading-4 opacity-80">{note}</span>}
      </dt>
      <dd className="font-medium tabular-nums">{value.toLocaleString("en-US")}</dd>
    </div>
  );
}

const PASSWORD_OWNER = { publication: "This page's password", entry: "This page's password", graph: "The graph password", collection: "The collection password" };

/** For the page's managers: the password that opens this page has been entered more than a private page usually sees. */
export function PasswordViewsWarning({ v }: { v: ViewFooter }) {
  return (
    <p className="mt-3 flex gap-2 text-xs text-muted-foreground">
      <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
      <span>
        <span className="font-medium text-foreground">Only people who manage this page see this.</span>{" "}
        {PASSWORD_OWNER[v.lockScope ?? "publication"]} has been entered {plural(v.unlocks ?? 0, "time", "times")} since it was
        last changed. If that&rsquo;s more people than you shared it with, change it.
      </span>
    </p>
  );
}
