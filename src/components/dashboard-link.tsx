import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { viewerId } from "@/lib/viewer";

/**
 * "Back to dashboard" in the top-right corner of public pages, for anyone signed in, so they don't
 * have to edit the URL to get back. `href` points at the most relevant dashboard list.
 */
export async function DashboardLink({ href = "/dashboard" }: { href?: string }) {
  if (!(await viewerId())) return null;
  return (
    <Link href={href} className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5 bg-card" })}>
      <ArrowLeftIcon />
      <span className="sm:hidden">Dashboard</span>
      <span className="max-sm:hidden">Back to dashboard</span>
    </Link>
  );
}
