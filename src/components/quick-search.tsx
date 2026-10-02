"use client";

import { CornerDownLeftIcon, FileTextIcon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { cn } from "cn";
import type { QuickResult } from "@/app/api/search/route";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type Item = { key: string; label: React.ReactNode; detail?: React.ReactNode; href: string; icon: React.ReactNode };

/**
 * Search from anywhere: ⌘K, Ctrl+K or `/`. Lists the best site-wide matches as you type; Enter on
 * the first rows searches this graph or collection (`scope`) or the whole site.
 */
export function QuickSearch({
  scope,
  siteSearch,
  variant = "icon",
}: {
  /** Whether the viewer may search the whole site (verified email and Roam graph). */
  siteSearch: boolean;
  /** The graph or collection being viewed: its list path and name. */
  scope?: { path: string; name: string };
  variant?: "icon" | "field";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  // Results with the search they answer, so stale ones never show for a newer search.
  const [found, setFound] = useState<{ term: string; results: QuickResult[] }>({ term: "", results: [] });
  const [active, setActive] = useState(0);
  const listId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName));
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (!open || !term || !siteSearch) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d: { results?: QuickResult[] }) => setFound({ term, results: d.results ?? [] }))
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q, open, siteSearch]);

  const term = q.trim();
  const results = found.term === term ? found.results : [];
  const enc = encodeURIComponent(term);
  const items: Item[] = term
    ? [
        ...(scope
          ? [
              {
                key: "scope",
                label: (
                  <>
                    Search {scope.name} for “{term}”
                  </>
                ),
                href: `${scope.path}?q=${enc}`,
                icon: <SearchIcon />,
              },
            ]
          : []),
        ...results.map((r) => ({
          key: r.href,
          label: r.title,
          detail: (
            <>
              {r.source}
              {r.tags.length > 0 && <span className="text-roam-ref"> · {r.tags.map((t) => `#${t}`).join(" ")}</span>}
            </>
          ),
          href: r.href,
          icon: <FileTextIcon />,
        })),
        siteSearch
          ? { key: "all", label: <>Search all of Roam Publish for “{term}”</>, href: `/search?q=${enc}`, icon: <SearchIcon /> }
          : {
              key: "all",
              label: <span className="text-muted-foreground">Searching everywhere needs a verified Roam graph</span>,
              href: "/search",
              icon: <SearchIcon />,
            },
      ]
    : [];
  const current = Math.min(active, Math.max(0, items.length - 1));

  const go = (href: string) => {
    setOpen(false);
    setQ("");
    router.push(href);
  };

  return (
    <>
      {variant === "field" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-[30px] w-full max-w-64 items-center gap-2 rounded-sm bg-card px-2.5 text-sm text-muted-foreground shadow-[inset_0_0_0_1px_var(--input),inset_0_1px_1px_rgba(17,20,24,0.2)]"
        >
          <SearchIcon className="size-4" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded-sm px-1 font-mono text-[11px] shadow-[inset_0_0_0_1px_var(--border)]">/</kbd>
        </button>
      ) : (
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Search" title="Search (/)" onClick={() => setOpen(true)}>
          <SearchIcon />
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false} className="top-24 translate-y-0 gap-0 p-0 sm:max-w-xl">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <form
            role="search"
            className="flex items-center gap-2 border-b px-3 py-2.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (items[current]) go(items[current].href);
            }}
          >
            <SearchIcon className="size-4 text-muted-foreground" />
            <input
              autoFocus
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, items.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                }
              }}
              placeholder={scope ? (siteSearch ? `Search ${scope.name} or everywhere` : `Search ${scope.name}`) : "Search Roam Publish"}
              aria-label="Search"
              aria-controls={listId}
              aria-activedescendant={items[current] ? `${listId}-${current}` : undefined}
              className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
          </form>
          {items.length > 0 && (
            <ul id={listId} role="listbox" aria-label="Results" className="flex max-h-96 flex-col gap-0.5 overflow-y-auto p-1.5">
              {items.map((it, i) => (
                <li
                  key={it.key}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === current}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(it.href)}
                  className={cn("flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground", i === current && "bg-accent")}
                >
                  {it.icon}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{it.label}</span>
                    {it.detail && <span className="truncate text-xs text-muted-foreground">{it.detail}</span>}
                  </span>
                  {i === current && <CornerDownLeftIcon className="size-3.5!" />}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-4 border-t px-3 py-2 text-xs text-muted-foreground">
            <span>↑↓ Move</span>
            <span>↵ Open</span>
            <span className="ml-auto">Esc Close</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
