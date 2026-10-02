import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { isAdmin } from "@/lib/admin";
import { canSearchSite } from "@/lib/graph-access";
import { QuickSearch } from "./quick-search";
import { auth } from "@/lib/auth";
import { SignOutButton } from "./sign-out-button";
import { ThemeToggle } from "./theme-toggle";

export async function SiteHeader() {
  const session = await auth.api.getSession({ headers: await headers() });
  const siteSearch = await canSearchSite(session?.user.id ?? null);
  return (
    <header className="border-b bg-card shadow-[0_1px_1px_rgba(17,20,24,0.06)]">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between gap-2 px-4 sm:gap-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span aria-hidden className="flex shrink-0 items-center gap-1">
            <Image src="/emoji/earth.svg" alt="" width={18} height={18} />
            <Image src="/emoji/memo.svg" alt="" width={18} height={18} />
          </span>
          <span className="sr-only sm:not-sr-only">Roam Publish</span>
        </Link>
        {siteSearch && (
          <div className="hidden flex-1 justify-center sm:flex">
            <QuickSearch variant="field" siteSearch />
          </div>
        )}
        <nav className="flex min-w-0 items-center gap-0 whitespace-nowrap sm:gap-1">
          {siteSearch && (
            <span className="sm:hidden">
              <QuickSearch siteSearch />
            </span>
          )}
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
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
