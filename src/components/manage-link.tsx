import { Settings2Icon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/**
 * "Manage" in the top-right corner of public pages, matching the page-level Manage button. The caller
 * decides who is allowed to see it; `href` is the dashboard screen that edits this thing.
 */
export function ManageLink({ href }: { href: string }) {
  return (
    <Link href={href} className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5 bg-card" })}>
      <Settings2Icon /> Manage
    </Link>
  );
}
