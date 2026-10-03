import Link from "next/link";
import { cn } from "cn";
import { SourcePopover } from "./source-popover";

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

function FooterLinks({ className }: { className: string }) {
  return (
    <nav aria-label="Footer" className="flex flex-wrap gap-x-3 gap-y-1">
      {LINKS.map((l) => (
        <Link key={l.label} href={l.href} className={className}>
          {l.label}
        </Link>
      ))}
      <SourcePopover className={className} links={SOURCE_LINKS} />
    </nav>
  );
}

const ejqs = (className: string) => (
  <a href="https://ejqs.net" target="_blank" rel="noopener" className={className}>
    @ejqs
  </a>
);

/**
 * The disclaimer on the left, About, Privacy, Terms and a Source code popup (web, extension, docs) on the right. `full` is the home page's
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
    return (
      <footer className={className}>
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-6 text-xs text-muted-foreground opacity-40 transition-opacity focus-within:opacity-100 hover:opacity-100 sm:flex-row sm:justify-between">
          <p className="text-center sm:text-left">
            Third-party service by {ejqs(link)} · Not affiliated with Roam Research.
          </p>
          <FooterLinks className={link} />
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
