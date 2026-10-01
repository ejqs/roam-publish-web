import Link from "next/link";
import type { ReactNode } from "react";

/** Published pages in the same graph: lowercase title → href. */
export type PageLinks = Map<string, string>;

type Rule = {
  re: RegExp;
  render: (m: RegExpExecArray, ctx: Ctx) => ReactNode;
};

type Ctx = { links: PageLinks; key: () => string };

const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : null);

function PageRef({ title, ctx, tag }: { title: string; ctx: Ctx; tag?: boolean }) {
  const href = ctx.links.get(title.toLowerCase());
  const label = tag ? `#${title}` : title;
  return href ? (
    <Link href={href} className="text-roam-ref hover:underline">
      {label}
    </Link>
  ) : (
    <span className={tag ? "text-roam-ref" : undefined}>{label}</span>
  );
}

// Order matters: earlier rules win when two match at the same index.
const rules: Rule[] = [
  { re: /`([^`]+)`/, render: (m) => <code className="rounded-sm bg-muted px-1 font-mono text-[0.9em]">{m[1]}</code> },
  {
    re: /\{\{\[\[(TODO|DONE)\]\]\}\}\s?/,
    render: (m) => (
      <input type="checkbox" checked={m[1] === "DONE"} readOnly disabled className="mr-1.5 align-middle" />
    ),
  },
  { re: /\{\{[^}]*\}\}/, render: () => null }, // other roam components are dropped
  {
    re: /!\[([^\]]*)\]\(([^)\s]+)\)/,
    render: (m) => {
      const src = safeUrl(m[2]);
      // eslint-disable-next-line @next/next/no-img-element
      return src ? <img src={src} alt={m[1]} className="my-1 max-w-full rounded-sm" /> : m[0];
    },
  },
  {
    re: /\[([^\]]+)\]\(([^)\s]+)\)/,
    render: (m, ctx) => {
      const href = safeUrl(m[2]);
      return href ? (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-link hover:underline">
          {renderInline(m[1], ctx)}
        </a>
      ) : (
        renderInline(m[1], ctx)
      );
    },
  },
  { re: /#\[\[([^\]]+)\]\]/, render: (m, ctx) => <PageRef title={m[1]} ctx={ctx} tag /> },
  { re: /\[\[([^\]]+)\]\]/, render: (m, ctx) => <PageRef title={m[1]} ctx={ctx} /> },
  { re: /(?<![\w&])#([\w-]+)/, render: (m, ctx) => <PageRef title={m[1]} ctx={ctx} tag /> },
  { re: /\(\(([\w-]{9,})\)\)/, render: () => null }, // unresolved block refs
  { re: /\*\*(.+?)\*\*/, render: (m, ctx) => <strong>{renderInline(m[1], ctx)}</strong> },
  { re: /__(.+?)__/, render: (m, ctx) => <em>{renderInline(m[1], ctx)}</em> },
  { re: /\^\^(.+?)\^\^/, render: (m, ctx) => <mark className="bg-[#fff3a3] px-0.5 dark:bg-[#5c4a00]">{renderInline(m[1], ctx)}</mark> },
  { re: /~~(.+?)~~/, render: (m, ctx) => <del>{renderInline(m[1], ctx)}</del> },
  {
    re: /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/,
    render: (m) => (
      <a href={m[0]} target="_blank" rel="noopener noreferrer nofollow" className="text-link hover:underline">
        {m[0]}
      </a>
    ),
  },
];

function renderInline(text: string, ctx: Ctx): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  while (rest.length) {
    let best: { m: RegExpExecArray; rule: Rule } | null = null;
    for (const rule of rules) {
      const m = rule.re.exec(rest);
      if (m && (!best || m.index < best.m.index)) best = { m, rule };
    }
    if (!best) {
      out.push(rest);
      break;
    }
    if (best.m.index > 0) out.push(rest.slice(0, best.m.index));
    out.push(<span key={ctx.key()}>{best.rule.render(best.m, ctx)}</span>);
    rest = rest.slice(best.m.index + best.m[0].length);
  }
  return out;
}

export function RoamText({ text, links }: { text: string; links: PageLinks }) {
  let i = 0;
  const ctx: Ctx = { links, key: () => `k${i++}` };

  const code = /^```(\w*)\n?([\s\S]*?)```\s*$/.exec(text);
  if (code) {
    return (
      <pre className="my-1 overflow-x-auto rounded-sm bg-muted p-3 font-mono text-[13px]">
        <code>{code[2]}</code>
      </pre>
    );
  }

  // Attribute: "Key:: value"
  const attr = /^([^:`\n]{1,80})::\s?([\s\S]*)$/.exec(text);
  if (attr) {
    return (
      <>
        <strong>{attr[1]}:</strong> {renderInline(attr[2], ctx)}
      </>
    );
  }

  return <>{renderInline(text, ctx)}</>;
}
