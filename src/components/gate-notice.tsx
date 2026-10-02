import { LockIcon } from "lucide-react";
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
}: {
  blocker: NonNullable<Blocker>;
  /** "page", "graph" or "collection". */
  what: string;
  /** Where to come back to after signing in. */
  next: string;
  /** Shown above the form when the title may be shown (listed pages). */
  title?: string;
}) {
  return (
    <>
      <main className="flex flex-1 items-center bg-card">
        <div className="mx-auto flex w-full max-w-[700px] flex-col items-center gap-4 px-4 py-24 text-center">
          <LockIcon className="size-6 text-muted-foreground" />
          {title && <p className="text-muted-foreground">{title}</p>}
          {blocker.need === "password" ? (
            blocker.lock ? (
              <>
                <h1 className="text-2xl font-semibold">This {what} is password-protected</h1>
                <UnlockForm lock={blocker.lock} what={`this ${what}`} />
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
        </div>
      </main>
      <SiteFooter className="bg-card" />
    </>
  );
}
