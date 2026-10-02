import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { buttonVariants } from "@/components/ui/button";

/** Shown in place of content a moderator took down. The reason stays private to the owner. */
export function RemovedNotice({ what }: { what: "page" | "graph" | "collection" }) {
  return (
    <>
      <main className="flex flex-1 items-center bg-card">
        <div className="mx-auto w-full max-w-[700px] px-4 py-24 text-center">
          <h1 className="mb-3 text-2xl font-semibold">This {what} has been removed</h1>
          <p className="mb-6 text-muted-foreground">
            It was taken down by the roam.pub moderators for violating our content rules.
          </p>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Go to roam.pub
          </Link>
        </div>
      </main>
      <SiteFooter className="bg-card" />
    </>
  );
}
