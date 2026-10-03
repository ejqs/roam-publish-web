import { LockIcon, LockKeyholeIcon, RefreshCwIcon } from "lucide-react";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { buttonVariants } from "@/components/ui/button";
import type { Blocker } from "@/lib/gates";
import { UnlockForm } from "./unlock-form";

/** Shown instead of a protected page or front page until the reader passes its gate. */
export function GateNotice({
  blocker,
  what,
  next,
  title,
  members,
  manageHref,
}: {
  blocker: NonNullable<Blocker>;
  /** "page", "graph" or "collection". */
  what: string;
  /** Where to come back to after signing in. */
  next: string;
  /** Shown above the form when the title may be shown (listed pages). */
  title?: string;
  /** The graph or collection whose members also need an encrypted page's password. */
  members?: string;
  /** The dashboard, for someone who manages this page. */
  manageHref?: string;
}) {
  const Icon = blocker.need === "republish" ? RefreshCwIcon : blocker.need === "password" && blocker.encrypted ? LockKeyholeIcon : LockIcon;
  return (
    <>
      <main className="flex flex-1 items-center bg-card">
        <div className="mx-auto flex w-full max-w-[700px] flex-col items-center gap-4 px-4 py-24 text-center">
          <Icon className="size-6 text-muted-foreground" />
          {title && <p className="text-muted-foreground">{title}</p>}
          {blocker.need === "republish" ? (
            <>
              <h1 className="text-2xl font-semibold">This {what} is being updated</h1>
              <p className="text-muted-foreground">Its author needs to republish it before it can be read again. Check back later.</p>
            </>
          ) : blocker.need === "password" ? (
            blocker.lock ? (
              <>
                <h1 className="text-2xl font-semibold">
                  {blocker.again ? `Enter the password again` : blocker.encrypted ? `This ${what} is encrypted` : `This ${what} is password-protected`}
                </h1>
                {blocker.encrypted && (
                  <p className="max-w-md text-muted-foreground">
                    {blocker.again ? `This ${what} is now encrypted. ` : `Enter its password to read it. `}
                    Everyone needs the password{members ? `, including members of ${members}` : ""}.
                  </p>
                )}
                <UnlockForm lock={blocker.lock} what={`this ${what}`} />
                {blocker.encrypted && <p className="text-xs text-muted-foreground">Unlocking lasts 30 days on this browser.</p>}
              </>
            ) : (
              <h1 className="text-2xl font-semibold">This {what} isn&apos;t available</h1>
            )
          ) : blocker.need === "signin" ? (
            <>
              <h1 className="text-2xl font-semibold">This {what} is for members</h1>
              <p className="text-muted-foreground">Sign in to see it if you&apos;re a member.</p>
              <Link href={`/login?next=${encodeURIComponent(next)}`} className={buttonVariants()}>
                Sign in
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold">This {what} is for members</h1>
              <p className="text-muted-foreground">Ask its owner to invite you.</p>
            </>
          )}
          {manageHref && (
            <Link href={manageHref} className="border-t pt-3 text-xs text-link hover:underline">
              Manage
            </Link>
          )}
        </div>
      </main>
      <SiteFooter className="bg-card" />
    </>
  );
}
