import { cn } from "cn";

/**
 * `full` is the home page's footer. Everywhere else gets the quiet one: no border, small muted
 * text, and the background of whatever it sits under (pass `className="bg-card"` on card pages).
 */
export function SiteFooter({
  variant = "subtle",
  className,
}: {
  variant?: "full" | "subtle";
  className?: string;
}) {
  if (variant === "subtle") {
    return (
      <footer className={className}>
        <p className="mx-auto max-w-5xl px-4 py-6 text-center text-xs text-muted-foreground opacity-40 transition-opacity hover:opacity-100">
          Third-party service by{" "}
          <a
            href="https://ejqs.net"
            target="_blank"
            rel="noopener"
            className="underline-offset-2 hover:text-foreground hover:underline"
          >
            @ejqs
          </a>
          {" · "}Not affiliated with Roam Research
        </p>
      </footer>
    );
  }

  return (
    <footer className={cn("border-t bg-card", className)}>
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 text-sm text-muted-foreground">
        <p>
          This is a third-party service made by{" "}
          <a
            href="https://ejqs.net"
            target="_blank"
            rel="noopener"
            className="text-link hover:underline"
          >
            @ejqs
          </a>
        </p>
        <p className="hidden sm:block">Not affiliated with Roam Research.</p>
      </div>
    </footer>
  );
}
