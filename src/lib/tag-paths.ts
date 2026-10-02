import { COLLECTION_LIST, GRAPH_LIST, listHref, parseListState } from "./list-params";
import { collectionPath, graphPath } from "./publications";
import { normalizeTag } from "./tags";

/** How many pages with shared tags a published page suggests. */
export const RELATED_LIMIT = 3;

/** A graph's front page filtered to one tag. */
export function graphTagPath(graphName: string, tag: string) {
  const t = normalizeTag(tag);
  return listHref(GRAPH_LIST, graphPath(graphName), parseListState(GRAPH_LIST, {}), { tags: t ? [t] : [] });
}

/** A collection's page filtered to one tag. */
export function collectionTagPath(slug: string, tag: string) {
  const t = normalizeTag(tag);
  return listHref(COLLECTION_LIST, collectionPath(slug), parseListState(COLLECTION_LIST, {}), { tags: t ? [t] : [] });
}
