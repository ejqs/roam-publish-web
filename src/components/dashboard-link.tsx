import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { viewerId } from "@/lib/viewer";

/**
 * "Dashboard" at the left of a public page's bar, for anyone signed in, so they don't have to edit
 * the URL to get back. `href` points at the most relevant dashboard list.
 */
export async function DashboardLink({ href = "/dashboard" }: { href?: string }) {
  if (!(await viewerId())) return null;
  return (
    <Link href={href} className={buttonVariants({ variant: "ghost", size: "sm", className: "text-muted-foreground" })}>
      <ArrowLeftIcon />
      Dashboard
    </Link>
  );
}
