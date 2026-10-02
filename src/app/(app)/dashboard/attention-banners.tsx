import { CircleAlertIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import type { graph, profile, publication } from "@/db/schema";

type Severity = "destructive" | "warning" | "default";
type Item = { id: string; severity: Severity; title: string; body: string; action?: { label: string; href: string } };

const ICONS = { destructive: CircleAlertIcon, warning: TriangleAlertIcon, default: InfoIcon };
const RANK: Record<Severity, number> = { destructive: 0, warning: 1, default: 2 };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Everything on the account that needs the owner's attention, worst first. Uses the dashboard's own rows. */
export function attentionItems({
  graphs,
  pubs,
  me,
  invites = 0,
}: {
  graphs: (typeof graph.$inferSelect)[];
  pubs: (typeof publication.$inferSelect)[];
  me: typeof profile.$inferSelect | undefined;
  /** Pending invites and ownership transfers waiting on this person. */
  invites?: number;
}): Item[] {
  const items: Item[] = [];

  if (invites > 0) {
    items.push({
      id: "invites",
      severity: "warning",
      title: `${plural(invites, "invite")} waiting for you`,
      body: "Nothing changes until you accept.",
      action: { label: "Review", href: "/dashboard/invites" },
    });
  }
  const suspended = graphs.filter((g) => g.suspendedAt);
  const hasGraph = graphs.length > suspended.length;

  if (suspended.length) {
    items.push({
      id: "suspended",
      severity: "destructive",
      title:
        suspended.length === 1
          ? `${suspended[0].name} was suspended by a moderator`
          : `${suspended.length} graphs were suspended by a moderator`,
      body: "Their pages are hidden and publishing is turned off. Details are on each graph below.",
      action: { label: "View", href: `#graph-${suspended[0].id}` },
    });
  }

  const removed = pubs.filter((p) => p.removedAt);
  if (removed.length) {
    items.push({
      id: "removed",
      severity: "destructive",
      title: `${plural(removed.length, "page")} removed by a moderator`,
      body: "Removed pages are hidden from readers and can't be republished.",
      action: { label: "View", href: `#pub-${removed[0].id}` },
    });
  }

  // With no graphs at all, the empty state below already asks them to connect one.
  if (!hasGraph && graphs.length > 0 && me) {
    items.push({
      id: "profile-hidden",
      severity: "warning",
      title: "Your profile is hidden",
      body: `@${me.username} stays reserved, but it needs an active Roam graph to be shown.`,
      action: { label: "Connect a graph", href: "/onboarding" },
    });
  }

  if (hasGraph && !me) {
    items.push({
      id: "claim",
      severity: "warning",
      title: "Claim your username",
      body: "Get a short profile link that lists your graphs.",
      action: { label: "Claim username", href: "#profile" },
    });
  }

  const hiddenFrontPages = graphs.filter(
    (g) =>
      !g.suspendedAt &&
      !g.frontPage &&
      pubs.some((p) => p.graphId === g.id && p.visibility === "public" && !p.removedAt),
  );
  for (const g of hiddenFrontPages) {
    items.push({
      id: `front-page-${g.id}`,
      severity: "warning",
      title: `${g.name} has public pages but no front page`,
      body: "Readers can open each page by its link, but nothing lists them. Turn on the front page to list them.",
      action: { label: "Settings", href: `/dashboard/${encodeURIComponent(g.name)}/settings` },
    });
  }

  if (hasGraph && me && !me.isPublic) {
    items.push({
      id: "profile-private",
      severity: "default",
      title: "Your profile is private",
      body: `Make it public so readers can find your graphs at /u/${me.username}.`,
      action: { label: "Edit profile", href: "#profile" },
    });
  }

  return items.sort((a, b) => RANK[a.severity] - RANK[b.severity]);
}

export function AttentionBanners({ items }: { items: Item[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Needs your attention" className="flex flex-col gap-2">
      {items.map((item) => {
        const Icon = ICONS[item.severity];
        return (
          <Alert key={item.id} variant={item.severity} className="px-3 py-2.5">
            <Icon />
            <AlertTitle>{item.title}</AlertTitle>
            <AlertDescription className="text-pretty">{item.body}</AlertDescription>
            {item.action && (
              <div className="col-start-2 mt-2">
                <Link href={item.action.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  {item.action.label}
                </Link>
              </div>
            )}
          </Alert>
        );
      })}
    </section>
  );
}
