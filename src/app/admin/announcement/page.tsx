import { desc, gt } from "drizzle-orm";
import { BannerView } from "@/components/banner-view";
import { Badge } from "@/components/ui/badge";
import { db } from "@/db";
import { announcement } from "@/db/schema";
import { requireAdminPage } from "@/lib/admin";
import { jobStatus } from "@/lib/jobs";
import { jobByName } from "@/lib/jobs-registry";
import { BANNER_HOLD_MS, BANNER_WINDOW_MS, IMPACTS, RUNS_TO_SHOW } from "@/lib/status-banner";
import { fmtDate } from "../ui";
import { AnnouncementForm } from "./announcement-form";
import { RowButtons } from "./row-buttons";

export const metadata = { title: "Announcement · Admin" };

const DAY = 24 * 60 * 60_000;

export default async function AdminAnnouncementPage() {
  await requireAdminPage("/admin/announcement");
  const now = new Date();
  const job = jobByName("status-banner")!;
  const [rows, [jobRow]] = await Promise.all([
    // Live ones, and the last day's ended ones for context.
    db.select().from(announcement).where(gt(announcement.endsAt, new Date(now.getTime() - DAY))).orderBy(desc(announcement.updatedAt)),
    db.query.backgroundJob.findMany({ where: (j, { eq }) => eq(j.name, job.name) }),
  ]);
  const status = jobStatus(job, jobRow, now);
  const live = rows.filter((a) => a.endsAt > now);
  const ended = rows.filter((a) => a.endsAt <= now);

  return (
    <div className="flex max-w-3xl flex-col gap-10">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Up now</h2>
        <p className="text-sm text-muted-foreground">
          The banner sits above every page, for urgent things only: downtime, an outage, something people must act on.
          One shows at a time: critical before warning before info, and yours before an automatic one. A deploy that
          changes the Terms or Privacy policy puts up an info banner for signed-in people for two weeks on its own.
        </p>
        {live.length === 0 && <p className="text-sm text-muted-foreground">Nothing. The site has no banner.</p>}
        {live.map((a) => {
          const muted = !!a.mutedUntil && a.mutedUntil > now;
          return (
            <div key={a.id} className="flex flex-col gap-2 rounded-sm border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{a.source === "auto" ? "Automatic" : "Posted by an admin"}</Badge>
                <span>{a.audience === "everyone" ? "Everyone" : "Signed in only"}</span>
                <span>· since {fmtDate(a.startsAt)}</span>
                <span>· {a.source === "auto" && a.tone !== "info" ? "renewed while the problem lasts" : `ends ${fmtDate(a.endsAt)}`}</span>
                {muted && <Badge variant="secondary">Muted until {fmtDate(a.mutedUntil)}</Badge>}
              </div>
              <div className={muted ? "opacity-50" : undefined}>
                <div className="overflow-hidden rounded-sm border">
                  <BannerView announcement={a} preview />
                </div>
              </div>
              <RowButtons id={a.id} muted={muted} auto={a.source === "auto"} />
            </div>
          );
        })}
        {ended.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Ended in the last day ({ended.length})</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {ended.map((a) => (
                <li key={a.id} className="text-muted-foreground">
                  {fmtDate(a.startsAt)} – {fmtDate(a.endsAt)} · {a.tone} · {a.message}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Post an announcement</h2>
        <AnnouncementForm />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">Automatic banners</h2>
          <Badge variant={status.kind === "disabled" || status.kind === "never" ? "outline" : status.kind === "ok" || status.kind === "running" ? "secondary" : "destructive"}>
            {status.kind === "disabled"
              ? `Off: ${status.reason}`
              : status.kind === "never"
                ? "Not run yet"
                : status.kind === "ok" || status.kind === "running"
                  ? "On"
                  : `Job ${status.kind}`}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Every minute, the last {BANNER_WINDOW_MS / 60_000} minutes on Status are checked for problems people would notice.
          One seen {RUNS_TO_SHOW} minutes in a row puts up its banner; it goes {BANNER_HOLD_MS / 60_000} minutes after the
          problem stops being seen. Mute one that isn&apos;t helping. Warnings need 3+ errors over 2% of calls (or slow,
          for publishing); critical needs 5+ errors and a quarter of calls.
        </p>
        <ul className="flex flex-col gap-2 text-sm">
          {IMPACTS.map((i) => (
            <li key={i.key} className="flex flex-col gap-0.5">
              <span>
                <span className="font-medium">{i.label}</span>{" "}
                <span className="text-muted-foreground">
                  · {i.audience === "everyone" ? "everyone" : "signed in only"}
                  {i.critical ? "" : " · warning only"}
                </span>
              </span>
              <span className="text-muted-foreground">“{i.warning}”</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
