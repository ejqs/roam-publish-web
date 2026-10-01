import { headers } from "next/headers";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { isAdmin } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { SignOutButton } from "./sign-out-button";

export async function SiteHeader() {
  const session = await auth.api.getSession({ headers: await headers() });
  return (
    <header className="border-b bg-card shadow-[0_1px_1px_rgba(17,20,24,0.06)]">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between gap-2 px-4 sm:gap-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="shrink-0 text-lg leading-none tracking-[-2px] whitespace-nowrap">
            🌐📝
          </span>
          <span className="sr-only sm:not-sr-only">Roam Publish</span>
        </Link>
        <nav className="flex min-w-0 items-center gap-0 whitespace-nowrap sm:gap-1">
          <Link href="/discover" className={buttonVariants({ variant: "ghost" })}>
            Discover
          </Link>
          {session ? (
            <>
              {isAdmin(session.user) && (
                <Link href="/admin" className={buttonVariants({ variant: "ghost" })}>
                  Admin
                </Link>
              )}
              <Link href="/dashboard" className={buttonVariants({ variant: "ghost" })}>
                Dashboard
              </Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
                Log in
              </Link>
              <Link href="/signup" className={buttonVariants()}>
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
