import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { announcement, backgroundJob } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin";
import { checkHealth, type CheckState } from "@/lib/health";
import { jobStatus } from "@/lib/jobs";
import { JOBS } from "@/lib/jobs-registry";
import type { MetricKind } from "@/lib/telemetry";
import { isUnhealthy, type MetricStats, metricStats } from "@/lib/telemetry-stats";
import { fmtDate, param, STACKED_TABLE } from "../ui";

export const metadata = { title: "Status · Admin" };

const HOUR = 60 * 60_000;
const WINDOWS = { "1h": HOUR, "24h": 24 * HOUR, "7d": 7 * 24 * HOUR } as const;
type Window = keyof typeof WINDOWS;

const SECTIONS: { kind: MetricKind; title: string; note: string }[] = [
  {
    kind: "route",
    title: "API routes",
    note: "Route handlers. 5xx responses and thrown errors count as errors; 4xx are counted as rejected.",
  },
  { kind: "action", title: "Server actions", note: "Website forms and buttons. Only thrown errors count; a refused input doesn't." },
  {
    kind: "dep",
    title: "Outside services",
    note: "Calls to Roam's Append API, Umami and Resend. Roam refusing a token or graph counts as rejected.",
  },
  { kind: "page", title: "Page errors", note: "Errors while rendering a page. Page timings are on Railway's HTTP metrics." },
];

const ms = (v: number | null) =>
  v === null ? "—" : v < 1000 ? `${v} ms` : v < 60_000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v / 60_000)} min`;
const pct = (r: number) => (r === 0 ? "0%" : r < 0.001 ? "<0.1%" : `${(r * 100).toFixed(1)}%`);
const n = (v: number) => v.toLocaleString("en-US");

function Check({ label, state }: { label: string; state: CheckState }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {state === "ok" ? (
        <Badge variant="secondary">OK</Badge>
      ) : state === "off" ? (
        <Badge variant="outline">Off</Badge>
      ) : (
        <Badge variant="destructive">Failing</Badge>
      )}
    </div>
  );
}

function Tile({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xl font-semibold tabular-nums ${bad ? "text-destructive" : ""}`}>{value}</span>
    </div>
  );
}

function MetricTable({ rows, kind }: { rows: MetricStats[]; kind: MetricKind }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Nothing recorded in this window.</p>;
  const timed = kind !== "page";
  return (
    <Table className={STACKED_TABLE}>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="text-right">{timed ? "Calls" : "Errors"}</TableHead>
          {timed && (
            <>
              <TableHead className="text-right">Errors</TableHead>
              <TableHead className="text-right">Rejected</TableHead>
              <TableHead className="text-right">p50</TableHead>
              <TableHead className="text-right">p95</TableHead>
              <TableHead className="text-right">Max</TableHead>
            </>
          )}
          <TableHead>Last error</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((s) => (
          <TableRow key={s.name} className="align-top">
            <TableCell className="max-w-sm whitespace-normal break-all font-mono text-xs">
              {s.name.replace(/^(action|dep|page) /, "")}
              {timed && isUnhealthy(s) && (
                <Badge variant="destructive" className="ml-2 font-sans">
                  Check
                </Badge>
              )}
            </TableCell>
            <TableCell data-label={timed ? "Calls" : "Errors"} className="text-right tabular-nums">
              {n(s.count)}
            </TableCell>
            {timed && (
              <>
                <TableCell data-label="Errors" className="text-right tabular-nums">
                  {s.errors ? `${n(s.errors)} (${pct(s.errorRate)})` : "—"}
                </TableCell>
                <TableCell data-label="Rejected" className="text-right tabular-nums">
                  {s.rejected.length ? s.rejected.map((r) => `${r.status} ×${n(r.n)}`).join(" · ") : "—"}
                </TableCell>
                <TableCell data-label="p50" className="text-right tabular-nums text-muted-foreground">
                  {ms(s.p50)}
                </TableCell>
                <TableCell data-label="p95" className="text-right tabular-nums">
                  {ms(s.p95)}
                </TableCell>
                <TableCell data-label="Max" className="text-right tabular-nums text-muted-foreground">
                  {ms(s.maxMs)}
                </TableCell>
              </>
            )}
            <TableCell data-label="Last error" className="max-w-xs whitespace-normal text-xs">
              {s.lastError ? (
                <details>
                  <summary className="cursor-pointer text-destructive">{fmtDate(s.lastErrorAt)}</summary>
                  <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap break-words font-mono">
                    {s.lastError}
                  </pre>
                </details>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default async function AdminStatusPage(props: PageProps<"/admin/status">) {
  await requireAdminPage("/admin/status");
  const w = param((await props.searchParams).window);
  const window: Window = Object.hasOwn(WINDOWS, w) ? (w as Window) : "24h";
  const now = new Date();
  const [health, stats, lastHour, jobRows, banners] = await Promise.all([
    checkHealth(now),
    metricStats(new Date(now.getTime() - WINDOWS[window]), now),
    window === "1h" ? null : metricStats(new Date(now.getTime() - HOUR), now),
    db.select().from(backgroundJob),
    db
      .select({ tone: announcement.tone, message: announcement.message, mutedUntil: announcement.mutedUntil })
      .from(announcement)
      .where(and(eq(announcement.source, "auto"), gt(announcement.endsAt, now))),
  ]);
  const hourStats = (lastHour ?? stats).filter((s) => s.kind === "route" || s.kind === "action");
  const hourCalls = hourStats.reduce((a, s) => a + s.count, 0);
  const hourErrors = hourStats.reduce((a, s) => a + s.errors, 0);
  const pageErrors = (lastHour ?? stats).filter((s) => s.kind === "page").reduce((a, s) => a + s.count, 0);
  const byName = new Map(jobRows.map((r) => [r.name, r]));
  const badJobs = JOBS.filter((j) =>
    ["failing", "overdue", "stalled"].includes(jobStatus(j, byName.get(j.name), now).kind),
  ).length;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Health</h2>
          <div className="flex flex-wrap items-center gap-4">
            <Check label="Database" state={health.checks.database} />
            <Check label="Job worker" state={health.checks.jobs} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Requests, last hour" value={n(hourCalls)} />
          <Tile
            label="Errors, last hour"
            value={hourCalls ? `${n(hourErrors)} (${pct(hourErrors / hourCalls)})` : n(hourErrors)}
            bad={hourErrors > 0}
          />
          <Tile label="Page errors, last hour" value={n(pageErrors)} bad={pageErrors > 0} />
          <Link href="/admin/jobs" className="contents">
            <Tile label="Jobs needing a look" value={n(badJobs)} bad={badJobs > 0} />
          </Link>
        </div>
        <p className="text-sm">
          {banners.length ? (
            <>
              <span className="font-medium text-warning">Banner on the site:</span>{" "}
              {banners
                .map((b) => `${b.tone}, “${b.message}”${b.mutedUntil && b.mutedUntil > now ? " (muted)" : ""}`)
                .join(" · ")}{" "}
            </>
          ) : (
            <span className="text-muted-foreground">No automatic banner on the site. </span>
          )}
          <Link href="/admin/announcement" className="text-link hover:underline">
            Announcement
          </Link>
        </p>
        <p className="text-xs text-muted-foreground">
          Counts are saved once a minute, so the latest minute isn&apos;t here yet. Also on{" "}
          <code>/api/health</code> for uptime checks.
        </p>
      </section>

      <nav className="flex gap-1" aria-label="Time window">
        {(Object.keys(WINDOWS) as Window[]).map((k) => (
          <Link
            key={k}
            href={k === "24h" ? "/admin/status" : `/admin/status?window=${k}`}
            aria-current={k === window ? "page" : undefined}
            className={buttonVariants({ variant: k === window ? "secondary" : "ghost", size: "sm" })}
          >
            Last {k}
          </Link>
        ))}
      </nav>

      {SECTIONS.map(({ kind, title, note }) => (
        <section key={kind} className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="text-xs text-muted-foreground">{note}</p>
          </div>
          <MetricTable kind={kind} rows={stats.filter((s) => s.kind === kind)} />
        </section>
      ))}
    </div>
  );
}
