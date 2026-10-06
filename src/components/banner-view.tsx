import { CircleAlertIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import { cn } from "cn";
import type { AnnouncementTone } from "@/db/app-schema";
import { dismissible, dismissId } from "@/lib/announcement-shared";
import { DismissibleBanner } from "./dismissible-banner";

export type BannerData = {
  id: string;
  source: "manual" | "auto";
  key: string | null;
  startsAt: Date;
  tone: AnnouncementTone;
  message: string;
  linkUrl: string | null;
  linkText: string | null;
};

/** The site-wide banner itself. Also the live preview on /admin/announcement (`preview`). */
export function BannerView({ announcement: a, preview }: { announcement: BannerData; preview?: boolean }) {
  const critical = a.tone === "critical";
  const info = a.tone === "info";
  const Icon = critical ? CircleAlertIcon : info ? InfoIcon : TriangleAlertIcon;
  const body = (
    <>
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", critical ? "text-destructive" : info ? "text-muted-foreground" : "text-warning")} />
      <p className="min-w-0 flex-1 break-words">
        {a.message}
        {a.linkUrl && (
          <>
            {" "}
            <a href={a.linkUrl} className="font-medium text-link underline-offset-2 hover:underline">
              {a.linkText || "Details"}
            </a>
          </>
        )}
      </p>
    </>
  );
  const className = cn(
    "border-b text-sm text-foreground",
    critical ? "border-destructive/30 bg-destructive/10" : info ? "bg-muted" : "border-warning/30 bg-warning/10",
  );
  const inner = "mx-auto flex max-w-5xl items-start gap-2.5 px-4 py-2";
  if (dismissible(a))
    return (
      <DismissibleBanner id={dismissId(a)} className={className} innerClassName={inner} preview={preview}>
        {body}
      </DismissibleBanner>
    );
  return (
    <div role={preview ? undefined : "alert"} className={className}>
      <div className={inner}>{body}</div>
    </div>
  );
}
