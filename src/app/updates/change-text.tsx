import type { ReactNode } from "react";

const TOKEN = /(\*\*.+?\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
const SAFE_LINK = /^(https?:\/\/|\/(?!\/))/i;

/** A changelog bullet's markdown-lite: **bold**, `code` and [links](https://…). Anything else is text. */
export function ChangeText({ text }: { text: string }): ReactNode {
  return text.split(TOKEN).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return (
        <strong key={i} className="font-semibold">
          <ChangeText text={part.slice(2, -2)} />
        </strong>
      );
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return (
        <code key={i} className="rounded-sm bg-muted px-1 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      );
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link)
      return SAFE_LINK.test(link[2]) ? (
        <a key={i} href={link[2]} className="text-link hover:underline">
          {link[1]}
        </a>
      ) : (
        link[1]
      );
    return part;
  });
}
