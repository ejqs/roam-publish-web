import { FolderIcon, FolderOpenIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "cn";
import { LockHint } from "@/components/access-lock";
import { chipClass, ListStatus, NoMatches, Pagination, type ListRow } from "@/components/page-list";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ListTitle } from "@/components/sealed-title";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import type { FrontLayout } from "@/db/schema";
import { folderTree, flatten, type FolderNode } from "@/lib/folders";
import { isFiltered, type ListConfig, listHref, type ListState, toggleTag } from "@/lib/list-params";
import type { TagCount } from "@/lib/list-query";
import { plainText } from "@/lib/slug";

/**
 * A graph's or collection's front page as folder tiles over page cards ("shelves") or a folder
 * tree beside them ("explorer"). The table layout stays in page-list.tsx. Everything is a link or a
 * GET form, so it works without JavaScript.
 */

export type FrontFolder = {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  /** Listed pages in it and the folders under it. */
  n: number;
  /** The first few titles directly in it, in the list's order. */
  titles: string[];
};

export type FrontCard = ListRow & {
  /** Where it sits, when that's not the folder being browsed. */
  folder?: string;
  /** The start of its text, when the reader may read it. */
  excerpt?: string;
  date: string;
};

type Props<S extends string> = {
  layout: Exclude<FrontLayout, "list">;
  cfg: ListConfig<S>;
  path: string;
  state: ListState<S>;
  /** The place's name, for breadcrumbs inside a folder. */
  name: string;
  /** Title, lock and description, shown at the top level. */
  header: React.ReactNode;
  folders: FrontFolder[];
  /** The folder being browsed and the ones above it, top level first. */
  chain: FrontFolder[];
  cards: FrontCard[];
  matching: number;
  /** Pages in the place, whatever the filters. */
  total: number;
  tags: TagCount[];
  placeholder: string;
  tagIndex?: string;
};

export function FrontPage<S extends string>(props: Props<S>) {
  const { layout, cfg, path, state, folders, chain, total } = props;
  const href = (change: Partial<ListState<S>>) => listHref(cfg, path, state, change);
  const current = chain.at(-1);
  // Empty folders wait in Manage until they hold a listed page.
  const tree = folderTree(folders.filter((f) => f.n > 0));
  const here = current ? flatten(tree).find((f) => f.id === current.id)?.children ?? [] : tree;
  const filtered = isFiltered(state);

  const top = current ? (
    <FolderHeader name={props.name} chain={chain} href={href} />
  ) : (
    props.header
  );
  const search = <FrontSearch path={path} state={state} placeholder={current ? `Search ${current.name}` : props.placeholder} />;
  const body =
    total === 0 ? (
      <Empty className="border bg-card">
        <EmptyHeader>
          <EmptyTitle>No pages yet</EmptyTitle>
          <EmptyDescription>Check back later.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    ) : (
      <div className="flex flex-col gap-8">
        {!filtered && here.length > 0 && (
          // Explorer's tree lists them beside the cards; phones get these instead.
          <section aria-label="Folders" className={cn("flex flex-col gap-3", layout === "explorer" && "sm:hidden")}>
            {layout === "shelves" && <h2 className="text-sm font-semibold text-foreground/80">Folders</h2>}
            <div className={cn("grid gap-3", layout === "shelves" ? "sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]")}>
              {here.map((f) =>
                layout === "shelves" ? (
                  <FolderTile key={f.id} folder={f} href={href({ folder: f.slug, q: "", tags: [], kind: null })} />
                ) : (
                  <FolderChip key={f.id} folder={f} href={href({ folder: f.slug, q: "", tags: [], kind: null })} />
                ),
              )}
            </div>
          </section>
        )}
        <section aria-label="Pages" className="flex flex-col gap-3">
          {/* Unfiltered, the cards are the pages right here; filtered, they're picked from everything under it. */}
          <ListStatus cfg={cfg} path={path} state={state} matching={props.matching} total={filtered ? (current?.n ?? total) : props.matching} />
          {props.cards.length ? (
            <div className={cn("grid gap-3 sm:gap-4", layout === "shelves" ? "sm:grid-cols-2 lg:grid-cols-3" : "grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]")}>
              {props.cards.map((c) => (
                <PageCard key={c.href} card={c} tagHref={(t) => href({ tags: state.tags.includes(t) ? state.tags : toggleTag(state.tags, t) })} />
              ))}
            </div>
          ) : filtered ? (
            <NoMatches cfg={cfg} path={path} state={state} />
          ) : (
            <p className="text-sm text-muted-foreground">{current ? "No pages directly in this folder." : "Every page is in a folder."}</p>
          )}
          <Pagination cfg={cfg} path={path} state={state} matching={props.matching} />
        </section>
      </div>
    );

  if (layout === "explorer")
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-start gap-x-10 gap-y-8 px-4 pt-16 pb-16">
        <nav aria-label="Folders" className="hidden w-56 shrink-0 flex-col gap-6 pt-2 sm:flex">
          <FolderTree tree={tree} current={current?.id ?? null} total={total} href={href} name={props.name} />
          <TagChips tags={props.tags} state={state} href={href} tagIndex={props.tagIndex} vertical />
        </nav>
        <main className="flex min-w-0 flex-[999_1_32rem] flex-col gap-6">
          <div className="flex flex-col gap-1">{top}</div>
          <div className="flex flex-col gap-3">
            {search}
            <div className="sm:hidden">
              <TagChips tags={props.tags} state={state} href={href} tagIndex={props.tagIndex} />
            </div>
          </div>
          {body}
        </main>
      </div>
    );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 pt-16 pb-16">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">{top}</div>
        <div className="flex max-w-2xl flex-col gap-3">
          {search}
          <TagChips tags={props.tags} state={state} href={href} tagIndex={props.tagIndex} />
        </div>
      </div>
      {body}
    </div>
  );
}

function FolderHeader<S extends string>({
  name,
  chain,
  href,
}: {
  name: string;
  chain: FrontFolder[];
  href: (change: Partial<ListState<S>>) => string;
}) {
  const current = chain.at(-1)!;
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-muted-foreground">
        <ol className="flex min-w-0 flex-wrap items-center gap-1.5">
          {[{ label: name, slug: null as string | null }, ...chain.slice(0, -1).map((f) => ({ label: f.name, slug: f.slug }))].map((c) => (
            <li key={c.slug ?? ""} className="flex items-center gap-1.5">
              <Link href={href({ folder: c.slug, q: "", tags: [], kind: null })} className="hover:text-foreground hover:underline">
                {c.label}
              </Link>
              <span aria-hidden>/</span>
            </li>
          ))}
        </ol>
      </nav>
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
          <FolderOpenIcon className="size-6" />
        </span>
        <h1 className="text-[30px] leading-tight font-semibold break-words sm:text-[38px]">{current.name}</h1>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {current.n} {current.n === 1 ? "page" : "pages"}
      </p>
    </>
  );
}

function FrontSearch<S extends string>({ path, state, placeholder }: { path: string; state: ListState<S>; placeholder: string }) {
  return (
    <form action={path} role="search" className="relative">
      {/* Searching keeps the folder, tags and type. */}
      {state.folder && <input type="hidden" name="folder" value={state.folder} />}
      {state.tags.map((t) => (
        <input key={t} type="hidden" name="tag" value={t} />
      ))}
      {state.kind && <input type="hidden" name="kind" value={state.kind} />}
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        name="q"
        defaultValue={state.q}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 pl-9 text-[15px] md:text-[15px]"
      />
    </form>
  );
}

function TagChips<S extends string>({
  tags,
  state,
  href,
  tagIndex,
  vertical,
}: {
  tags: TagCount[];
  state: ListState<S>;
  href: (change: Partial<ListState<S>>) => string;
  tagIndex?: string;
  vertical?: boolean;
}) {
  // Chosen tags stay visible even when the counts no longer list them.
  const shown = [...state.tags.filter((t) => !tags.some((c) => c.tag === t)).map((tag) => ({ tag, n: 0 })), ...tags];
  if (!shown.length) return null;
  return (
    <div className={cn("flex gap-2", vertical ? "flex-col" : "items-center")}>
      {vertical && <span className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Tags</span>}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by tag">
        {shown.map(({ tag, n }) => {
          const on = state.tags.includes(tag);
          return (
            <Link key={tag} href={href({ tags: toggleTag(state.tags, tag) })} aria-current={on ? "true" : undefined} className={cn(chipClass(on), "h-7 px-2.5")}>
              #{tag}
              {n > 0 && <span className="text-muted-foreground tabular-nums">{n}</span>}
            </Link>
          );
        })}
        {tagIndex && (
          <Link href={tagIndex} className="ml-1 text-xs text-link hover:underline">
            All tags
          </Link>
        )}
      </div>
    </div>
  );
}

const pages = (n: number) => `${n} ${n === 1 ? "page" : "pages"}`;

function FolderTile({ folder, href }: { folder: FolderNode<FrontFolder>; href: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 p-4 rounded-sm bg-card shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_0_0_rgba(17,20,24,0),0_1px_1px_rgba(17,20,24,0.2)] transition-shadow hover:shadow-[0_0_0_1px_rgba(17,20,24,0.1),0_1px_1px_rgba(17,20,24,0.2),0_2px_6px_rgba(17,20,24,0.2)]"
    >
      <span className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-primary">
          <FolderIcon className="size-[18px]" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-semibold group-hover:underline">{folder.name}</span>
          <span className="text-xs text-muted-foreground">
            {pages(folder.n)}
            {folder.children.length > 0 && ` · ${folder.children.length} ${folder.children.length === 1 ? "folder" : "folders"}`}
          </span>
        </span>
      </span>
      {folder.titles.length > 0 && (
        <span className="flex flex-col gap-1 border-t pt-2.5">
          {folder.titles.map((t, i) => (
            <span key={i} className="truncate text-[13px] text-muted-foreground">
              {plainText(t) || "Untitled"}
            </span>
          ))}
        </span>
      )}
    </Link>
  );
}

function FolderChip({ folder, href }: { folder: FrontFolder; href: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-sm bg-card shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_0_0_rgba(17,20,24,0),0_1px_1px_rgba(17,20,24,0.2)] transition-shadow hover:shadow-[0_0_0_1px_rgba(17,20,24,0.1),0_1px_1px_rgba(17,20,24,0.2),0_2px_6px_rgba(17,20,24,0.2)]">
      <FolderIcon className="size-4 shrink-0 text-primary" />
      <span className="min-w-0 truncate font-medium">{folder.name}</span>
      <span className="ml-auto text-xs text-muted-foreground tabular-nums">{folder.n}</span>
    </Link>
  );
}

function FolderTree<S extends string>({
  tree,
  current,
  total,
  href,
  name,
}: {
  tree: FolderNode<FrontFolder>[];
  current: string | null;
  total: number;
  href: (change: Partial<ListState<S>>) => string;
  name: string;
}) {
  const row = (label: React.ReactNode, n: number, to: string, on: boolean, depth: number, key: string) => (
    <li key={key}>
      <Link
        href={to}
        aria-current={on ? "page" : undefined}
        style={{ paddingLeft: `${0.5 + (depth - 1) * 1}rem` }}
        className={cn(
          "group/node flex items-center gap-2 rounded-sm py-1.5 pr-2 text-sm",
          on ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent",
        )}
      >
        {label}
        <span className={cn("ml-auto text-xs tabular-nums", on ? "text-primary-foreground/80" : "text-muted-foreground")}>{n}</span>
      </Link>
    </li>
  );
  return (
    <ul className="flex flex-col gap-0.5">
      {row(<span className="min-w-0 truncate">{name}</span>, total, href({ folder: null, q: "", tags: [], kind: null }), current === null, 1, "")}
      {flatten(tree).map((f) =>
        row(
          <>
            <FolderIcon className="size-4 shrink-0 text-muted-foreground group-aria-[current=page]/node:text-primary-foreground" />
            <span className="min-w-0 truncate">{f.name}</span>
          </>,
          f.n,
          href({ folder: f.slug, q: "", tags: [], kind: null }),
          current === f.id,
          f.depth + 1,
          f.id,
        ),
      )}
    </ul>
  );
}

function PageCard({ card, tagHref }: { card: FrontCard; tagHref: (t: string) => string }) {
  return (
    <article className="relative flex min-h-36 flex-col gap-2 p-4 rounded-sm bg-card shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_0_0_rgba(17,20,24,0),0_1px_1px_rgba(17,20,24,0.2)] transition-shadow hover:shadow-[0_0_0_1px_rgba(17,20,24,0.1),0_1px_1px_rgba(17,20,24,0.2),0_2px_6px_rgba(17,20,24,0.2)]">
      {card.folder && (
        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <FolderIcon className="size-3 shrink-0" />
          <span className="truncate">{card.folder}</span>
        </span>
      )}
      <h3 className="flex min-w-0 items-start gap-1.5 text-[15px] leading-snug font-semibold">
        {card.lock && (
          <span className="relative z-10 mt-0.5 inline-flex">
            <LockHint lock={card.lock} />
          </span>
        )}
        {/* The whole card opens the page; tags stay their own links above it. */}
        <Link href={card.href} className="line-clamp-2 break-words after:absolute after:inset-0 hover:underline">
          <ListTitle title={card.title} sealed={card.sealedTitle} />
        </Link>
        {card.kind === "block" && (
          <Badge variant="secondary" className="mt-0.5 h-[18px] shrink-0 px-1.5">
            Block
          </Badge>
        )}
      </h3>
      {card.snippet ? (
        <p className="line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">
          {card.snippet.map((p, i) =>
            p.hit ? (
              <mark key={i} className="bg-roam-highlight px-0.5 text-inherit">
                {p.text}
              </mark>
            ) : (
              p.text
            ),
          )}
        </p>
      ) : card.excerpt ? (
        <p className="line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">{card.excerpt}</p>
      ) : card.lock && !card.lock.encrypted ? (
        <p className="text-[13px] text-muted-foreground">{card.lock.access === "members" ? "Members only." : "Password protected."}</p>
      ) : null}
      {card.tags.length > 0 && (
        <span className="relative z-10 flex flex-wrap gap-x-2 gap-y-0.5">
          {card.tags.slice(0, 4).map((t) => (
            <Link key={t} href={tagHref(t)} className="text-xs text-roam-ref hover:underline">
              #{t}
            </Link>
          ))}
        </span>
      )}
      <span className="mt-auto flex items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{card.author ? `By ${card.author}` : ""}</span>
        <span className="shrink-0">{card.date}</span>
      </span>
    </article>
  );
}
