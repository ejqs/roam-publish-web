import { cn } from "cn";

/**
 * The bar along the top of public pages. The owner's way back and Manage sit on the left, apart from
 * the tools every reader gets on the right, all in one quiet button style.
 */
export function PageBar({ owner, children, className }: { owner?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1 pdf:hidden", className)}>
      <div className="mr-auto flex min-w-0 items-center gap-1">{owner}</div>
      {children}
    </div>
  );
}
