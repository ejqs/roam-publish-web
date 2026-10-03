import katex from "katex";
import "katex/dist/katex.min.css";
import Link from "next/link";
import type { ReactNode } from "react";
import { BARE_TAG, pageRef, type RefMatch } from "@/lib/roam-refs";
import { CodeBlock } from "./code-block";

/**
 * Published pages in the same graph or collection: lowercase title → href. `tagHref` is where a
 * #tag goes when no published page has its title, like the front page filtered to that tag.
 */
export class PageLinks extends Map<string, string> {
  constructor(
    entries: Iterable<readonly [string, string]> = [],
    readonly tagHref?: (tag: string) => string,
  ) {
    super(entries);
  }
}

type Match = RefMatch;

type Rule = {
  find: (s: string) => Match | null;
  render: (g: string[], ctx: Ctx) => ReactNode;
};

type Ctx = { links: PageLinks; key: () => string };

const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : null);

const re =
  (r: RegExp) =>
  (s: string): Match | null => {
    const m = r.exec(s);
    return m && { index: m.index, length: m[0].length, groups: [...m] };
  };

// A URL that may contain one level of balanced parentheses, like Wikipedia's `Foo_(bar)`.
const URL_IN_PARENS = String.raw`((?:[^()\s]|\([^()\s]*\))+)`;

function PageRef({ title, ctx, tag, label }: { title: string; ctx: Ctx; tag?: boolean; label?: ReactNode }) {
  const href = ctx.links.get(title.toLowerCase()) ?? (tag ? ctx.links.tagHref?.(title) : undefined);
  // A nested ref like [[a [[b]] c]]: each inner ref gets its own link, and the text around it
  // links to the outer page, so no link ends up inside another.
  if (!label && pageRef("")(title)) return <NestedRef text={tag ? `#${title}` : title} href={href} tag={tag} ctx={ctx} />;
  const text = label ?? (tag ? `#${title}` : title);
  return href ? (
    <Link href={href} className="text-roam-ref hover:underline">
      {text}
    </Link>
  ) : (
    <span className={tag || label ? "text-roam-ref" : undefined}>{text}</span>
  );
}

/** A nested ref's title: outer text links to `href`, inner refs link to their own pages. */
function NestedRef({ text, href, tag, ctx }: { text: string; href?: string; tag?: boolean; ctx: Ctx }) {
  const outer = (t: string) =>
    href ? (
      <Link href={href} className="text-roam-ref hover:underline">
        {t}
      </Link>
    ) : (
      <span className={tag ? "text-roam-ref" : undefined}>{t}</span>
    );
  const inner = pageRef("")(text);
  if (!inner) return outer(text);
  const before = text.slice(0, inner.index);
  const after = text.slice(inner.index + inner.length);
  return (
    <>
      {before && outer(before)}
      <PageRef title={inner.groups[1]} ctx={ctx} />
      {after && <NestedRef text={after} href={href} tag={tag} ctx={ctx} />}
    </>
  );
}

// Roam renders all math inline, even when it's the whole block.
function TeX({ tex, alone }: { tex: string; alone?: boolean }) {
  const html = katex.renderToString(tex, { throwOnError: false });
  return alone ? (
    <div className="overflow-x-auto overflow-y-hidden" dangerouslySetInnerHTML={{ __html: html }} />
  ) : (
    <span dangerouslySetInnerHTML={{ __html: html }} />
  );
}

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-sm border border-dashed border-border px-1.5 text-xs leading-5 text-muted-foreground whitespace-normal">
      {children}
    </span>
  );
}

function LinkCard({ url, label }: { url: string; label: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-border px-2 py-0.5 text-link hover:underline"
    >
      <span className="text-xs text-muted-foreground uppercase">{label}</span>
      <span className="truncate">{url}</span>
    </a>
  );
}

/** `{{name: arg}}` / `{{[[name]]: arg}}` → lowercase name and trimmed arg. */
export function parseComponent(inner: string) {
  const m = /^\s*(?:\[\[([^\]]+)\]\]|([^:]+?))\s*(?::\s*([\s\S]*))?$/.exec(inner);
  if (!m) return { name: "", arg: "" };
  return { name: (m[1] ?? m[2]).trim().toLowerCase(), arg: (m[3] ?? "").trim() };
}

const COMPONENT = /\{\{((?:[^{}]|\{[^{}]*\})*)\}\}/;
const DIAGRAMS = new Set(["mermaid", "diagram", "drawing", "excalidraw"]);

/** The Roam component that decides how a block's children render, if any. */
export function blockComponent(text: string): "table" | "kanban" | "diagram" | null {
  const all = new RegExp(COMPONENT.source, "g");
  for (const m of text.matchAll(all)) {
    const { name } = parseComponent(m[1]);
    if (name === "table" || name === "kanban") return name;
    if (DIAGRAMS.has(name)) return "diagram";
  }
  return null;
}

/** True when the block is a single `{{…}}` component, which Roam draws in place of the text. */
export const isOnlyComponent = (text: string) => new RegExp(`^\\s*${COMPONENT.source}\\s*$`).test(text);

function videoEmbedSrc(url: string) {
  let m = /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(url);
  if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
  m = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;
  m = /loom\.com\/(?:share|embed)\/(\w+)/.exec(url);
  if (m) return `https://www.loom.com/embed/${m[1]}`;
  return null;
}

const APP_HOST = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").host;

const VIDEO_FILE = /\.(mp4|webm|mov|m4v|ogv)(?:[?#]|$)/i;
const AUDIO_FILE = /\.(mp3|m4a|wav|ogg|oga|aac|flac|opus)(?:[?#]|$)/i;

function Component({ inner }: { inner: string }) {
  const { name, arg } = parseComponent(inner);
  const url = safeUrl(/https?:\/\/[^\s)\]}]+/.exec(arg)?.[0] ?? "");

  if (DIAGRAMS.has(name)) return <Placeholder>Diagram not shown</Placeholder>;
  if (name === "query" || name === "mentions") return <Placeholder>Query results aren&apos;t published</Placeholder>;

  if ((name === "youtube" || name === "video") && url) {
    const src = videoEmbedSrc(url);
    if (src)
      return (
        <iframe
          src={src}
          title="Embedded video"
          className="my-1 block aspect-video w-full rounded-sm border-0"
          allow="encrypted-media; picture-in-picture; fullscreen"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      );
    if (VIDEO_FILE.test(url)) return <video src={url} controls preload="metadata" className="my-1 block w-full rounded-sm" />;
    if (AUDIO_FILE.test(url)) return <audio src={url} controls preload="metadata" className="my-1 block w-full" />;
    return <LinkCard url={url} label="Video" />;
  }
  if (name === "audio" && url) return <audio src={url} controls preload="metadata" className="my-1 block w-full" />;
  if (name === "pdf" && url) {
    // <object> can't be sandboxed, so only other sites' files are embedded; ours are linked.
    if (new URL(url).host === APP_HOST) return <LinkCard url={url} label="PDF" />;
    return (
      <object data={url} type="application/pdf" className="my-1 block h-[500px] w-full rounded-sm border border-border">
        <LinkCard url={url} label="PDF" />
      </object>
    );
  }
  if (name === "iframe" && url) {
    // A sandboxed page on our own origin could lift its own sandbox, so link to those instead.
    if (new URL(url).host === APP_HOST) return <LinkCard url={url} label="Link" />;
    return (
      <iframe
        src={url}
        title="Embedded page"
        className="my-1 block h-[400px] w-full rounded-sm border border-border"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    );
  }
  if ((name === "tweet" || name === "twitter") && url) return <LinkCard url={url} label="Post" />;

  // Tables and embeds render at the block level; everything else (buttons, sliders,
  // timers, counters, roam/js…) has no published form.
  return null;
}

// Order matters: earlier rules win when two match at the same index.
const rules: Rule[] = [
  { find: re(/\$\$([\s\S]+?)\$\$/), render: (g) => <TeX tex={g[1]} /> },
  {
    find: re(/`([^`]+)`/),
    render: (g) => <code className="rounded-sm bg-muted px-1 font-mono text-[0.9em]">{g[1]}</code>,
  },
  {
    find: re(/\{\{(?:\[\[)?(TODO|DONE)(?:\]\])?\}\}\s?/),
    render: (g) => <input type="checkbox" checked={g[1] === "DONE"} readOnly disabled className="mr-1.5 align-middle" />,
  },
  { find: re(COMPONENT), render: (g) => <Component inner={g[1]} /> },
  {
    find: re(new RegExp(String.raw`!\[([^\]]*)\]\(${URL_IN_PARENS}\)`)),
    render: (g) => {
      const src = safeUrl(g[2]);
      // eslint-disable-next-line @next/next/no-img-element
      return src ? <img src={src} alt={g[1]} className="my-1 max-w-full rounded-sm" /> : g[0];
    },
  },
  // Aliases: [label](((block-uid))) and [label]([[Page]])
  {
    find: re(/\[([^\]]+)\]\(\(\(([\w-]{9,})\)\)\)/),
    render: (g, ctx) => <span className="text-roam-ref">{renderInline(g[1], ctx)}</span>,
  },
  {
    find: re(/\[([^\]]+)\]\(\[\[([^\]]+)\]\]\)/),
    render: (g, ctx) => <PageRef title={g[2]} ctx={ctx} label={renderInline(g[1], ctx)} />,
  },
  {
    find: re(new RegExp(String.raw`\[([^\]]+)\]\(${URL_IN_PARENS}\)`)),
    render: (g, ctx) => {
      const href = safeUrl(g[2]);
      return href ? (
        <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-link hover:underline">
          {renderInline(g[1], ctx)}
        </a>
      ) : (
        renderInline(g[1], ctx)
      );
    },
  },
  { find: pageRef("#"), render: (g, ctx) => <PageRef title={g[1]} ctx={ctx} tag /> },
  { find: pageRef(""), render: (g, ctx) => <PageRef title={g[1]} ctx={ctx} /> },
  { find: re(BARE_TAG), render: (g, ctx) => <PageRef title={g[1]} ctx={ctx} tag /> },
  { find: re(/\(\(([\w-]{9,})\)\)/), render: () => null }, // unresolved block refs
  { find: re(/\*\*([\s\S]+?)\*\*/), render: (g, ctx) => <strong>{renderInline(g[1], ctx)}</strong> },
  { find: re(/__([\s\S]+?)__/), render: (g, ctx) => <em>{renderInline(g[1], ctx)}</em> },
  {
    find: re(/\^\^([\s\S]+?)\^\^/),
    render: (g, ctx) => <mark className="bg-roam-highlight px-0.5 text-inherit">{renderInline(g[1], ctx)}</mark>,
  },
  { find: re(/~~([\s\S]+?)~~/), render: (g, ctx) => <del>{renderInline(g[1], ctx)}</del> },
  {
    find: re(/https?:\/\/(?:[^\s<>()]|\([^\s<>()]*\))+(?<![.,;:!?'"])/),
    render: (g) => (
      <a href={g[0]} target="_blank" rel="noopener noreferrer nofollow" className="text-link hover:underline">
        {g[0]}
      </a>
    ),
  },
];

function renderInline(text: string, ctx: Ctx): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  while (rest.length) {
    let best: { m: Match; rule: Rule } | null = null;
    for (const rule of rules) {
      const m = rule.find(rest);
      if (m && (!best || m.index < best.m.index)) best = { m, rule };
    }
    if (!best) {
      out.push(rest);
      break;
    }
    if (best.m.index > 0) out.push(rest.slice(0, best.m.index));
    out.push(<span key={ctx.key()}>{best.rule.render(best.m.groups, ctx)}</span>);
    rest = rest.slice(best.m.index + best.m.length);
  }
  return out;
}

const FENCE = /```(?:([^\n`]*)\n)?([\s\S]*?)```/g;

/** Inline text with fenced code blocks anywhere in it. */
function renderRich(text: string, ctx: Ctx): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(FENCE)) {
    // Drop the line break hugging each fence; the code block already starts a new line.
    const before = text.slice(last, m.index).replace(/\n$/, "");
    if (before) out.push(...renderInline(before, ctx));
    out.push(<CodeBlock key={ctx.key()} code={m[2]} lang={m[1] ?? ""} />);
    last = m.index + m[0].length;
    if (text[last] === "\n") last++;
  }
  const after = text.slice(last);
  if (after) out.push(...renderInline(after, ctx));
  return out;
}

/** A block that is only a horizontal rule: `---`, or dashes typed as `——` by autocorrect. */
export const isRule = (text: string) => /^(?:-{3,}|(?=.*[—–―])[-—–―]{2,})$/.test(text.trim());

export function RoamText({ text, links }: { text: string; links: PageLinks }) {
  let i = 0;
  const ctx: Ctx = { links, key: () => `k${i++}` };

  if (isRule(text)) return <hr className="my-2 border-border" />;

  const math = /^\s*\$\$([\s\S]+?)\$\$\s*$/.exec(text);
  if (math) return <TeX tex={math[1]} alone />;

  // Quote: "> text" (or Roam's "[[>]] text")
  const quote = /^(?:>|\[\[>\]\])\s?([\s\S]*)$/.exec(text);
  if (quote) {
    return (
      <blockquote className="my-0.5 border-l-[3px] border-border pl-3 text-muted-foreground">
        {renderRich(quote[1], ctx)}
      </blockquote>
    );
  }

  // Attribute: "Key:: value"
  const attr = /^([^:`\n]{1,80})::\s?([\s\S]*)$/.exec(text);
  if (attr) {
    return (
      <>
        <strong>{attr[1]}:</strong> {renderRich(attr[2], ctx)}
      </>
    );
  }

  return <>{renderRich(text, ctx)}</>;
}
