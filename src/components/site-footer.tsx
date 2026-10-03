import Link from "next/link";
import { cn } from "cn";
import { SourcePopover } from "./source-popover";
import { WhatsNewLink } from "./whats-new-link";

export const SOURCE_URL = "https://github.com/ejqs/roam-publish-web";
export const EXTENSION_SOURCE_URL = "https://github.com/ejqs/roam-publish";
export const DOCS_SOURCE_URL = "https://github.com/ejqs/roam-publish-docs";
export const ISSUES_URL = `${SOURCE_URL}/issues`;

const SOURCE_LINKS = [
  { label: "Web", href: SOURCE_URL },
  { label: "Extension", href: EXTENSION_SOURCE_URL },
  { label: "Docs", href: DOCS_SOURCE_URL },
];

const LINKS = [
  { label: "About", href: "/#about" },
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
];

/** `fade` dims each link at rest; What's new skips it while there's something unseen. */
function FooterLinks({ className, fade = "" }: { className: string; fade?: string }) {
  return (
    <nav aria-label="Footer" className="flex flex-wrap gap-x-3 gap-y-1">
      {LINKS.map((l) => (
        <Link key={l.label} href={l.href} className={cn(className, fade)}>
          {l.label}
        </Link>
      ))}
      <WhatsNewLink className={className} quietClassName={fade} />
      <SourcePopover className={cn(className, fade)} links={SOURCE_LINKS} />
    </nav>
  );
}

const ejqs = (className: string) => (
  <a href="https://ejqs.net" target="_blank" rel="noopener" className={className}>
    @ejqs
  </a>
);

/**
 * The disclaimer on the left, About, Privacy, Terms, What's new and a Source code popup (web, extension, docs) on the right. `full` is the home page's
 * footer. Everywhere else gets the quiet one: no border, small muted text, and the background of
 * whatever it sits under (pass `className="bg-card"` on card pages).
 */
export function SiteFooter({
  variant = "subtle",
  className,
}: {
  variant?: "full" | "subtle";
  className?: string;
}) {
  if (variant === "subtle") {
    const link = "underline-offset-2 hover:text-foreground hover:underline";
    // Faded per item rather than as a whole, so What's new can stay at full strength with its dot.
    const fade = "opacity-40 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100";
    return (
      <footer className={className}>
        <div className="group mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <p className={cn("text-center sm:text-left", fade)}>
            Third-party service by {ejqs(link)} · Not affiliated with Roam Research.
          </p>
          <FooterLinks className={link} fade={fade} />
        </div>
      </footer>
    );
  }

  const link = "text-link hover:underline";
  return (
    <footer className={cn("border-t bg-card", className)}>
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          This is a third-party service made by {ejqs(link)}. Not affiliated with Roam Research. Icon by{" "}
          <a href="https://github.com/jdecked/twemoji" target="_blank" rel="noopener" className={link}>
            Twemoji
          </a>
          ,{" "}
          <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener" className={link}>
            CC BY 4.0
          </a>
          .
        </p>
        <FooterLinks className={link} />
      </div>
    </footer>
  );
}
