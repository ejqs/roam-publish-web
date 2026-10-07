import "server-only";
import { asc, eq, inArray, isNull, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { FrontFolder } from "@/components/front-page";
import { db } from "@/db";
import { folder } from "@/db/schema";
import { folderChain, subtreeIds, titleInFolder } from "./folders";
import type { FolderStat } from "./list-query";
import { isFiltered, type ListState } from "./list-params";

/** A graph's or collection's folders, in their order. */
export function loadFolders(place: { graphId: string } | { collectionId: string }) {
  return db
    .select({ id: folder.id, name: folder.name, slug: folder.slug, parentId: folder.parentId, position: folder.position })
    .from(folder)
    .where("graphId" in place ? eq(folder.graphId, place.graphId) : eq(folder.collectionId, place.collectionId))
    .orderBy(asc(folder.position), asc(folder.createdAt));
}

type Row = Awaited<ReturnType<typeof loadFolders>>[number];

/**
 * Which pages a front page lists: unfiltered, the ones right in the folder being browsed (loose ones
 * at the top); searching or filtering by tag, everything under it. `column` is the rows' folder id.
 */
export function browse(folders: Row[], state: ListState<string>, column: PgColumn) {
  const current = state.folder ? folders.find((f) => f.slug === state.folder) : undefined;
  const chain = current ? folderChain(folders, current.id) : [];
  const subtree = current ? inArray(column, subtreeIds(folders, current.id)) : undefined;
  let where: SQL | undefined = subtree;
  if (!isFiltered(state)) where = current ? eq(column, current.id) : folders.length ? isNull(column) : undefined;
  return { current, chain, where, subtree };
}

/** Folders with how many pages each holds, counting the folders under it, and its first titles. */
export function withStats(folders: Row[], stats: FolderStat[]): FrontFolder[] {
  const by = new Map(stats.map((s) => [s.folderId, s]));
  return folders.map((f) => ({
    ...f,
    n: subtreeIds(folders, f.id).reduce((sum, id) => sum + (by.get(id)?.n ?? 0), 0),
    titles: (by.get(f.id)?.titles ?? []).map((t) => titleInFolder(t, folderChain(folders, f.id))),
  }));
}

/** The folders being browsed, with their stats, top level first. */
export const chainOf = (shown: FrontFolder[], chain: { id: string }[]) =>
  chain.map((c) => shown.find((f) => f.id === c.id)).filter((f): f is FrontFolder => !!f);

/** A card's title and the folder it sits in, when that isn't the one being browsed. */
export function cardPlace(folders: Row[], folderId: string | null, currentId: string | undefined, title: string) {
  const chain = folderChain(folders, folderId);
  return {
    title: titleInFolder(title, chain),
    folder: folderId && folderId !== currentId && chain.length ? chain.map((f) => f.name).join(" / ") : undefined,
  };
}
