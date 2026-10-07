"use client";

import { ArrowDownIcon, ArrowUpIcon, FolderIcon, FolderPlusIcon, GripVerticalIcon, LayoutGridIcon, ListIcon, PanelLeftIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { FrontLayout } from "@/db/schema";
import { arrangeBlocked } from "@/lib/control-rules";
import { flatten, FOLDER_NAME_MAX, folderTree, type FolderRow, MAX_FOLDERS, subtreeIds, suggestFromNamespaces, titleInFolder, folderChain } from "@/lib/folders";
import { plainText } from "@/lib/slug";
import { changed, useUnsavedChanges } from "@/lib/unsaved-changes";
import { type ArrangeTarget, saveArrangement } from "./arrange-actions";

export type ArrangeItem = { id: string; title: string; kind: "page" | "block"; folderId: string | null };

const LAYOUTS: { value: FrontLayout; label: string; text: string; Icon: typeof ListIcon }[] = [
  { value: "shelves", label: "Shelves", text: "Folder tiles, then pages as cards with their first lines.", Icon: LayoutGridIcon },
  { value: "explorer", label: "Explorer", text: "A folder tree and tags beside the page cards.", Icon: PanelLeftIcon },
  { value: "list", label: "List", text: "One table of every page, without folders.", Icon: ListIcon },
];

// Blueprint's HTML select.
const selectClass =
  "h-[30px] min-w-0 rounded-sm border-0 bg-card px-2 text-sm shadow-[inset_0_0_0_1px_rgba(17,20,24,0.2),0_1px_2px_rgba(17,20,24,0.1)] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--ring),0_0_0_2px_color-mix(in_oklab,var(--ring)_40%,transparent)] disabled:opacity-50 dark:bg-input/30 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)]";

let next = 0;
const newId = () => `new-${Date.now().toString(36)}-${next++}`;

/**
 * Manage › Arrange: a graph's or collection's front page layout, its folders, and which page is
 * in each. Nothing is saved until Save, and leaving with changes asks first.
 */
export function ArrangeForm({
  target,
  layout: initialLayout,
  folders: initialFolders,
  items,
}: {
  target: ArrangeTarget;
  layout: FrontLayout;
  folders: FolderRow[];
  items: ArrangeItem[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [layout, setLayout] = useState(initialLayout);
  const [folders, setFolders] = useState(initialFolders);
  const initialPlaces = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i.folderId])), [items]);
  const [places, setPlaces] = useState<Record<string, string | null>>(initialPlaces);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null | undefined>(undefined);
  const [find, setFind] = useState("");

  const dirty = changed({ layout, folders, places }, { layout: initialLayout, folders: initialFolders, places: initialPlaces });
  useUnsavedChanges(dirty);
  const blocked = arrangeBlocked(folders);

  const tree = flatten(folderTree(folders));
  const ids = new Set(folders.map((f) => f.id));
  const placeOf = (id: string) => (places[id] && ids.has(places[id]!) ? places[id] : null);
  const shown = items.filter((i) => !find || plainText(i.title).toLowerCase().includes(find.toLowerCase()));
  const inFolder = (folderId: string | null) => shown.filter((i) => placeOf(i.id) === folderId);
  const suggestion = suggestFromNamespaces(
    folders,
    items.map((i) => ({ ...i, folderId: placeOf(i.id) })),
    newId,
    (row) => row,
  );

  const move = (item: string, to: string | null) => setPlaces((p) => ({ ...p, [item]: to }));
  const rename = (id: string, name: string) => setFolders((fs) => fs.map((f) => (f.id === id ? { ...f, name } : f)));
  const reparent = (id: string, parentId: string | null) =>
    setFolders((fs) => {
      const f = fs.find((x) => x.id === id)!;
      // Moved folders go last among their new siblings.
      return [...fs.filter((x) => x.id !== id), { ...f, parentId }];
    });
  const shift = (id: string, by: -1 | 1) =>
    setFolders((fs) => {
      const f = fs.find((x) => x.id === id)!;
      const siblings = fs.filter((x) => x.parentId === f.parentId);
      const other = siblings[siblings.indexOf(f) + by];
      if (!other) return fs;
      const out = [...fs];
      const a = out.indexOf(f);
      const b = out.indexOf(other);
      [out[a], out[b]] = [out[b], out[a]];
      return out;
    });
  const remove = (id: string) => {
    const gone = new Set(subtreeIds(folders, id));
    setFolders((fs) => fs.filter((f) => !gone.has(f.id)));
    setPlaces((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v && gone.has(v) ? null : v])));
  };
  const add = () => {
    const names = new Set(folders.filter((f) => !f.parentId).map((f) => f.name.trim().toLowerCase()));
    let name = "New folder";
    for (let n = 2; names.has(name.toLowerCase()); n++) name = `New folder ${n}`;
    setFolders((fs) => [...fs, { id: newId(), name, parentId: null }]);
  };
  const applySuggestion = () => {
    setFolders(suggestion.folders);
    setPlaces((p) => ({ ...p, ...Object.fromEntries(suggestion.moves) }));
  };
  const discard = () => {
    setLayout(initialLayout);
    setFolders(initialFolders);
    setPlaces(initialPlaces);
  };
  const save = () =>
    start(async () => {
      const moves = Object.fromEntries(
        items.filter((i) => placeOf(i.id) !== (initialPlaces[i.id] ?? null)).map((i) => [i.id, placeOf(i.id)]),
      );
      const res = await saveArrangement(target, { layout, folders, moves });
      if (!res.ok) return void toast.error(res.message);
      toast.success(res.message);
      router.refresh();
    });

  const dropProps = (to: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragging) return;
      e.preventDefault();
      setOver(to);
    },
    onDragLeave: () => setOver((o) => (o === to ? undefined : o)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragging) move(dragging, to);
      setDragging(null);
      setOver(undefined);
    },
  });

  const pageRows = (folderId: string | null, depth: number) => {
    const rows = inFolder(folderId);
    const chain = folderChain(folders, folderId);
    if (!rows.length)
      return (
        <p className="py-2 pr-3 text-xs text-muted-foreground" style={{ paddingLeft: `${depth * 1.25 + 2.25}rem` }}>
          {folderId ? "Drag pages here, or pick this folder next to a page." : find ? "No loose pages match." : "Every page is in a folder."}
        </p>
      );
    return rows.map((i) => (
      <div
        key={i.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", i.id);
          setDragging(i.id);
        }}
        onDragEnd={() => {
          setDragging(null);
          setOver(undefined);
        }}
        className={cn("flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 border-t py-1.5 pr-3", dragging === i.id && "opacity-50")}
        style={{ paddingLeft: `${depth * 1.25 + 0.75}rem` }}
      >
        <GripVerticalIcon className="size-4 shrink-0 cursor-grab text-muted-foreground/60" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm">{plainText(titleInFolder(i.title, chain)) || "Untitled"}</span>
        {i.kind === "block" && (
          <Badge variant="secondary" className="h-[18px] px-1.5">
            Block
          </Badge>
        )}
        <select
          aria-label={`Folder for ${plainText(i.title) || "Untitled"}`}
          value={placeOf(i.id) ?? ""}
          onChange={(e) => move(i.id, e.target.value || null)}
          className={cn(selectClass, "max-w-48")}
        >
          <option value="">Not in a folder</option>
          {tree.map((f) => (
            <option key={f.id} value={f.id}>
              {"  ".repeat(f.depth - 1)}
              {f.name || "Untitled folder"}
            </option>
          ))}
        </select>
      </div>
    ));
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Front page layout</CardTitle>
          <CardDescription>How visitors browse the pages listed on the front page.</CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset className="grid gap-2 sm:grid-cols-3">
            <legend className="sr-only">Front page layout</legend>
            {LAYOUTS.map(({ value, label, text, Icon }) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer flex-col gap-1.5 rounded-sm p-3 text-sm shadow-[0_0_0_1px_rgba(17,20,24,0.15),0_1px_1px_rgba(17,20,24,0.2)] has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                  layout === value ? "bg-primary/10 shadow-[0_0_0_2px_var(--primary)]" : "hover:bg-accent",
                )}
              >
                <input type="radio" name="layout" value={value} checked={layout === value} onChange={() => setLayout(value)} className="sr-only" />
                <span className="flex items-center gap-2 font-medium">
                  <Icon className="size-4 text-primary" />
                  {label}
                </span>
                <span className="text-xs text-muted-foreground">{text}</span>
              </label>
            ))}
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Folders</CardTitle>
          <CardDescription>
            Drag pages into folders, or pick one next to each page. Folders only change this website; nothing is sent to Roam.
            {layout === "list" && " The List layout doesn't show them."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {suggestion.moves.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-sm bg-primary/10 px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                {suggestion.moves.size} {suggestion.moves.size === 1 ? "page has a" : "pages have"} Roam namespace
                {suggestion.moves.size === 1 ? "" : "s"} like <strong>{[...new Set(items.filter((i) => suggestion.moves.has(i.id)).map((i) => i.title.split("/")[0]))].slice(0, 2).join("/, ")}/</strong>.
                {" "}Put {suggestion.moves.size === 1 ? "it" : "them"} in matching folders?
              </span>
              <Button size="sm" onClick={applySuggestion} disabled={suggestion.folders.length > MAX_FOLDERS}>
                {suggestion.created > 0 ? `Make ${suggestion.created} ${suggestion.created === 1 ? "folder" : "folders"}` : "Move them"}
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={add} disabled={folders.length >= MAX_FOLDERS}>
              <FolderPlusIcon />
              New folder
            </Button>
            {items.length > 12 && (
              <Input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a page" aria-label="Find a page" className="h-8 w-48" />
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {items.length} {items.length === 1 ? "page" : "pages"} listed on the front page
            </span>
          </div>

          <div className="overflow-hidden rounded-sm border">
            {tree.map((f, i) => {
              const siblings = tree.filter((x) => x.parentId === f.parentId);
              const subtree = new Set(subtreeIds(folders, f.id));
              return (
                <section
                  key={f.id}
                  aria-label={f.name || "Untitled folder"}
                  {...dropProps(f.id)}
                  className={cn(i > 0 && "border-t", over === f.id && "bg-primary/10")}
                >
                  <div className="flex flex-wrap items-center gap-2 bg-muted/50 py-2 pr-3" style={{ paddingLeft: `${(f.depth - 1) * 1.25 + 0.75}rem` }}>
                    <FolderIcon className="size-4 shrink-0 text-primary" aria-hidden />
                    <Input
                      value={f.name}
                      maxLength={FOLDER_NAME_MAX}
                      onChange={(e) => rename(f.id, e.target.value)}
                      aria-label="Folder name"
                      className="h-8 min-w-32 flex-1 font-medium"
                    />
                    <select
                      aria-label={`Put ${f.name || "this folder"} inside`}
                      value={f.parentId ?? ""}
                      onChange={(e) => reparent(f.id, e.target.value || null)}
                      className={cn(selectClass, "max-w-40")}
                    >
                      <option value="">Top level</option>
                      {tree
                        .filter((x) => !subtree.has(x.id))
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            In {x.name || "Untitled folder"}
                          </option>
                        ))}
                    </select>
                    <span className="inline-flex">
                      <Button variant="ghost" size="icon-sm" aria-label="Move folder up" disabled={siblings[0]?.id === f.id} onClick={() => shift(f.id, -1)}>
                        <ArrowUpIcon />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Move folder down" disabled={siblings.at(-1)?.id === f.id} onClick={() => shift(f.id, 1)}>
                        <ArrowDownIcon />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Delete ${f.name || "folder"}; its pages go back to not being in a folder`} title="Delete folder; its pages stay listed, outside any folder" onClick={() => remove(f.id)}>
                        <Trash2Icon />
                      </Button>
                    </span>
                  </div>
                  {pageRows(f.id, f.depth)}
                </section>
              );
            })}
            <section aria-label="Not in a folder" {...dropProps(null)} className={cn(tree.length > 0 && "border-t", over === null && "bg-primary/10")}>
              <div className="bg-muted/50 px-3 py-2.5 text-sm font-medium">
                Not in a folder
                <span className="ml-2 text-xs font-normal text-muted-foreground">Shown below the folders on the front page</span>
              </div>
              {pageRows(null, 0)}
            </section>
          </div>
        </CardContent>
      </Card>

      {/* Stays in view while there's something to save. */}
      <div className={cn("-mx-4 flex flex-wrap items-center justify-end gap-3 px-4 py-3", dirty && "sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur")}>
        {blocked && <p className="mr-auto text-xs text-destructive">{blocked}</p>}
        {!blocked && dirty && !pending && <p className="mr-auto text-xs text-muted-foreground">Unsaved changes</p>}
        <Button variant="outline" onClick={discard} disabled={pending || !dirty}>
          Discard
        </Button>
        <Button onClick={save} disabled={pending || !dirty || !!blocked}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
