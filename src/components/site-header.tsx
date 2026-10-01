import { headers } from "next/headers";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { SignOutButton } from "./sign-out-button";

export async function SiteHeader() {
  const session = await auth.api.getSession({ headers: await headers() });
  return (
    <header className="border-b bg-card shadow-[0_1px_1px_rgba(17,20,24,0.06)]">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex size-6 items-center justify-center rounded-sm bg-primary text-xs text-primary-foreground">
            RP
          </span>
          Roam Publish
        </Link>
        <nav className="flex items-center gap-1">
          {session ? (
            <>
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
