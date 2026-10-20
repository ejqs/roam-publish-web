import { Settings2Icon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/**
 * "Manage" in a public page's bar, matching the published page's Manage button. The caller
 * decides who is allowed to see it; `href` is the dashboard screen that edits this thing.
 */
export function ManageLink({ href }: { href: string }) {
  return (
    <Link href={href} title="Manage" className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground max-sm:px-1.5" })}>
      <Settings2Icon />
      <span className="max-sm:sr-only">Manage</span>
    </Link>
  );
}
