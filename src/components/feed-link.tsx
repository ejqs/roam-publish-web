import { RssIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** RSS icon in the top-right corner of front pages that have a feed. */
export function FeedLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      title="RSS feed"
      aria-label="RSS feed"
      className={buttonVariants({ variant: "ghost", size: "icon-sm", className: "text-muted-foreground" })}
    >
      <RssIcon />
    </a>
  );
}
