import { sql } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { backgroundJob, changelogEntry, type JobResult } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin";
import { type JobRow, type JobStatus, jobStatus, utcDay } from "@/lib/jobs";
import { FULL_SWEEP, JOBS } from "@/lib/jobs-registry";
import { viewSyncStats } from "@/lib/view-sync";
import { fmtDate, STACKED_TABLE } from "../ui";
import { RunNowButton } from "./run-now-button";

export const metadata = { title: "Jobs · Admin" };

function StatusBadge({ s }: { s: JobStatus }) {
  switch (s.kind) {
    case "ok":
      return <Badge variant="secondary">OK</Badge>;
    case "running":
      return <Badge>Running</Badge>;
    case "never":
      return <Badge variant="outline">Never run</Badge>;
    case "disabled":
      return <Badge variant="outline">Off: {s.reason}</Badge>;
    case "failing":
      return <Badge variant="destructive">Failing ({s.failures} in a row)</Badge>;
    case "overdue":
      return <Badge variant="destructive">Overdue</Badge>;
    case "stalled":
      return <Badge variant="destructive">Stalled</Badge>;
  }
}

const duration = (ms: number | null) =>
  ms === null ? "—" : ms < 1000 ? `${ms} ms` : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms / 60_000)} min`;

const resultText = (r: JobResult | null) =>
  r
    ? Object.entries(r)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
    : "—";

const num = (v: unknown) => (typeof v === "number" ? v : 0);
const date = (v: unknown) => (typeof v === "string" ? new Date(v) : null);

export default async function AdminJobsPage() {
  await requireAdminPage("/admin/jobs");
  const now = new Date();
  const [rows, views, queue] = await Promise.all([
    db.select().from(backgroundJob),
    viewSyncStats(now),
    db
      .select({ status: changelogEntry.status, n: sql<number>`count(*)::int` })
      .from(changelogEntry)
      .where(sql`${changelogEntry.status} in ('pending', 'sending', 'failed')`)
      .groupBy(changelogEntry.status),
  ]);
  const byName = new Map<string, JobRow>(rows.map((r) => [r.name, r]));
  const umamiRows = rows.filter((r) => r.name.startsWith("umami-"));
  const today = utcDay(now);
  const callsToday = umamiRows.reduce((n, r) => n + (r.cursor.callsDay === today ? num(r.cursor.callsToday) : 0), 0);
  const lastLimited = umamiRows
    .map((r) => date(r.cursor.lastRateLimitedAt))
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const fullSweepAt = date(byName.get(FULL_SWEEP)?.cursor.fullSweepAt);
  const queued = new Map(queue.map((q) => [q.status, q.n]));

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Background jobs</h2>
        <Table className={STACKED_TABLE}>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last run</TableHead>
              <TableHead>Last success</TableHead>
              <TableHead>Took</TableHead>
              <TableHead>Next run</TableHead>
              <TableHead>Result</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {JOBS.map((job) => {
              const row = byName.get(job.name);
              const status = jobStatus(job, row, now);
              return (
                <TableRow key={job.name} className="align-top">
                  <TableCell className="max-w-xs whitespace-normal">
                    <div className="font-medium">{job.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {job.schedule}. {job.description}
                    </div>
                    {row?.lastError && (
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer text-destructive">
                          Last error {fmtDate(row.lastErrorAt)}
                        </summary>
                        <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap break-words font-mono">
                          {row.lastError}
                        </pre>
                      </details>
                    )}
                  </TableCell>
                  <TableCell data-label="Status">
                    <StatusBadge s={status} />
                  </TableCell>
                  <TableCell data-label="Last run" className="text-muted-foreground">
                    {fmtDate(row?.lastFinishedAt)}
                  </TableCell>
                  <TableCell data-label="Last success" className="text-muted-foreground">
                    {fmtDate(row?.lastSuccessAt)}
                  </TableCell>
                  <TableCell data-label="Took" className="text-muted-foreground">
                    {duration(row?.lastDurationMs ?? null)}
                  </TableCell>
                  <TableCell data-label="Next run" className="text-muted-foreground">
                    {job.exclusive ? fmtDate(row?.nextDueAt) : job.schedule.toLowerCase()}
                  </TableCell>
                  <TableCell data-label="Result" className="max-w-xs whitespace-normal text-xs text-muted-foreground">
                    {resultText(row?.lastResult ?? null)}
                  </TableCell>
                  <TableCell>
                    {job.exclusive && (
                      <RunNowButton name={job.name} disabled={status.kind === "disabled" || status.kind === "running"} />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Umami view counts</h2>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Pages tracked</dt>
            <dd className="tabular-nums">{views.tracked.toLocaleString("en-US")}</dd>
            <dt className="text-muted-foreground">Pages with a count big enough to show</dt>
            <dd className="tabular-nums">{views.shown.toLocaleString("en-US")}</dd>
            <dt className="text-muted-foreground">Waiting for a country lookup</dt>
            <dd className="tabular-nums">{views.countriesDue.toLocaleString("en-US")}</dd>
            <dt className="text-muted-foreground">Oldest country lookup</dt>
            <dd>{fmtDate(views.oldestCountries)}</dd>
            <dt className="text-muted-foreground">Last full sweep</dt>
            <dd>{fmtDate(fullSweepAt)}</dd>
            <dt className="text-muted-foreground">API calls today (UTC)</dt>
            <dd className="tabular-nums">{callsToday.toLocaleString("en-US")}</dd>
            <dt className="text-muted-foreground">Last rate limit</dt>
            <dd>{fmtDate(lastLimited)}</dd>
          </dl>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Change log queue</h2>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Waiting to send</dt>
            <dd className="tabular-nums">{(queued.get("pending") ?? 0).toLocaleString("en-US")}</dd>
            <dt className="text-muted-foreground">Sending</dt>
            <dd className="tabular-nums">{(queued.get("sending") ?? 0).toLocaleString("en-US")}</dd>
            <dt className="text-muted-foreground">Failed</dt>
            <dd className="tabular-nums">{(queued.get("failed") ?? 0).toLocaleString("en-US")}</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}
