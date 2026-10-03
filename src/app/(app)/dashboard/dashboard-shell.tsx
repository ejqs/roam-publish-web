import { WhatsNewLink } from "@/components/whats-new-link";
import { pendingInvitesFor } from "@/lib/invites";
import { SectionTabs } from "./section-tabs";

export type DashboardTab = "/dashboard" | "/dashboard/keys" | "/dashboard/invites" | "/settings";

const TITLES: Record<DashboardTab, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/keys": "API keys",
  "/dashboard/invites": "Invites",
  "/settings": "Settings",
};

/**
 * The frame shared by the dashboard's tabs: the tab's title, the tab row and its content. Each tab
 * keeps its own URL; only the title and what's under the tabs change.
 */
export async function DashboardShell({
  current,
  userId,
  inviteCount,
  description,
  narrow,
  children,
}: {
  current: DashboardTab;
  userId: string;
  /** Pass it when the page already has the invites, to skip the query. */
  inviteCount?: number;
  description?: React.ReactNode;
  /** Keep the content to a reading width under the full-width tabs. */
  narrow?: boolean;
  children: React.ReactNode;
}) {
  const invites = inviteCount ?? (await pendingInvitesFor(userId)).length;
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:py-12">
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-semibold">{TITLES[current]}</h1>
          <WhatsNewLink className="text-sm text-muted-foreground hover:text-foreground" />
        </div>
        <SectionTabs
          label="Dashboard sections"
          current={current}
          tabs={[
            { href: "/dashboard", label: "Overview" },
            { href: "/dashboard/keys", label: "API keys" },
            { href: "/dashboard/invites", label: "Invites", count: invites },
            { href: "/settings", label: "Settings" },
          ]}
        />
      </div>
      <div className={`flex w-full flex-col gap-6 ${narrow ? "max-w-2xl" : ""}`}>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {children}
      </div>
    </div>
  );
}
