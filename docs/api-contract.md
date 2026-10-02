# Roam Publish — Extension ↔ Server Contract

Both `roam-publish` (extension) and `roam-publish-web` (server) implement this. Keep them in sync.
Why it's shaped this way, and how to change it safely: [roam-publish-docs](https://github.com/ejqs/roam-publish-docs).

## Canonical content + hash

```ts
type Node = {
  uid: string;
  string: string;
  heading?: 1 | 2 | 3;
  viewType?: "bullet" | "numbered" | "document"; // how this block's children are shown
  align?: "left" | "center" | "right" | "justify";
  embed?: Node; // what `{{embed: …}}` in this block's string embeds
  title?: string; // only on an embedded page's root
  children: Node[];
};
type PublishPayload = {
  rootUid: string;
  kind: "page" | "block";
  title: string;
  tree: Node;
  author?: string; // from the extension's Author name setting; not hashed
  anchorUid?: string; // uid of the shortlink block in Roam; not hashed
  timeZone?: string; // publisher's IANA time zone, for change log dates; not hashed
};
```

- `children` ordered by `:block/order` ascending.
- `heading` omitted when absent/0. `viewType` omitted for bullets and `align` for left, so older trees hash the same.
- `{{embed: ((uid))}}`, `{{embed: [[Page]]}}`, `{{embed-path: …}}` and `{{embed-children: …}}` (with or without `[[ ]]` around the name) keep their text unchanged; the embedded tree goes in `embed` (max embed depth 2, cycles skipped). A block embed is that block; a page embed is `{ uid, string: "", title, children }`; an `embed-children` embed has `string: ""`.
- For a **page**, the root node is `{ uid: pageUid, string: "", children: [top-level blocks] }`.
- For a **block**, the root node is the block itself (with its string) and its children.
- Block refs `((uid))` are **inlined** by the extension before hashing (resolved text, max depth 3; unknown refs stay as-is). Refs inside code, embeds and block-ref aliases `[label](((uid)))` are left as-is.
- The server accepts the optional fields above before the extension sends them, so ship server changes first: unknown keys are stripped before hashing and would fail the hash check.
- `contentHash = hex(sha256(stableStringify({ kind, title, tree })))`. `author`, `anchorUid` and `timeZone` are not part of the hash.
- **Shortlink blocks** (a block whose string starts with `{server}/p/{id}` for one of the graph's shortlinks) and
  everything under them are left out of `tree` at any depth by the extension before hashing (it knows the ids of
  its cached publications). The server drops them from the stored tree with all of the graph's ids (not from the
  hash), so they are never shown, even when an older build sends them.
- `stableStringify`: JSON with object keys sorted recursively, no whitespace, `undefined` keys dropped. Implementation lives in `stable-stringify.ts` in each repo (identical copies).

## Auth

- Extension requests carry `x-api-key: rp_…` (better-auth api-key plugin, metadata `{ graphId }`, reference id = the
  key holder's user id).
- **One key per person per graph.** The graph's owner and each member have their own key. Keys are created,
  regenerated and revoked on the website at `/dashboard/keys`; regenerating revokes the previous key. Only a hash is
  stored, so a key is shown once. A lost key is replaced by regenerating it.
- The owner is the account that verified the graph first. Members join by invite (see Members).

## Endpoints (base: server URL)

All responses are JSON. Errors: `{ error: string }` with 4xx/5xx.

### `POST /api/ext/claim` (retired)
→ `410 { error }`. Verification finishes on the website and keys come from the dashboard, so nothing on a daily note
can be claimed by whoever reads it first. Older extension builds show the error, which says where to get a key.

### `POST /api/ext/shortlinks`
Body `{ rootUid }` → `200 { shortUrl, anchorUid }`. The page's permanent `{server}/p/{id}`, created if needed. Any key
for the graph may call it. The extension calls it before the first publish so it can write the shortlink block first.

### `GET /api/ext/publications`
→ `200 { publications: [{ rootUid, kind, title, url, shortUrl, anchorUid, contentHash, visibility, removed, mine, updatedAt }] }` for the key's graph.
`shortUrl` and `anchorUid` are null for pages that don't have them yet.
`mine` is true for pages this key can change (all of them for the owner, the ones they published for a member).
`url` is the page's graph URL, or its first collection URL when it isn't shown in the graph.

### `POST /api/ext/publications`
Body `PublishPayload & { contentHash }` → `200 { status: "created" | "updated" | "unchanged", url, shortUrl, contentHash, visibility }`.
`anchorUid` is stored as the page's shortlink block; `timeZone` sets the graph's (the owner's always, a member's only
when none is set).
New publications are `unlisted` and go where the graph's "New pages go to" setting says (the graph, and/or
collections the publisher belongs to). Republishing never changes visibility or access. A republish with the same
hash but a different `author` updates only the byline (`status: "updated"`); omitting `author` leaves it as is.
`400` invalid body or hash mismatch · `401` bad key · `403` removed by a moderator, or the page was published by
another member · `413` payload too large (> 1 MB).

### `PATCH /api/ext/publications/:rootUid`
Body `{ visibility: "public" | "unlisted" }` → `200 { visibility, url }`. Lists or unlists the page in its graph.
`400` bad body · `403` removed by a moderator or not yours · `404` not published.

### `DELETE /api/ext/publications/:rootUid`
→ `200 { deleted: true }` (from the graph and every collection) · `403` removed by a moderator or not yours · `404` not published.

Members get `403 { error: "Only the person who published this page or the graph owner can change it" }` when they
republish, change or unpublish someone else's page.

## Moderation errors

Moderators can remove a page, suspend a graph, or ban an account. The extension shows `error` (plus `reason` when present) as-is.

- Every authenticated endpoint: `401 { error: "This account has been suspended" }` when the owner is banned, and `403 { error: "This graph was suspended by a moderator", reason }` when the graph is suspended.
- Publishing, changing visibility, or unpublishing a removed page: `403 { error: "This page was removed by a moderator", reason }`. A removed page can't be deleted, so a republish can't bring it back.

## CORS

Allowed origins: `https://roamresearch.com`, plus `http://localhost:*` in dev. Allowed headers: `content-type, x-api-key`. Methods: `GET, POST, PATCH, DELETE, OPTIONS`.

## Graph verification

1. Web onboarding (logged in) takes `graphName` + an append-only Roam token + the browser-local date and time zone.
2. The server appends `roam.pub connected this graph (safe to delete)` to that day's daily note with the Roam Append
   API. Roam only issues a graph's tokens to its admins and rejects a token used on another graph, so a successful
   write proves control of the graph. The token is then stored AES-256-GCM encrypted (`APPEND_TOKEN_KEY`) for the
   change log. The owner can remove or replace it in graph settings.
3. The first account to verify a graph owns it; the onboarding page then offers its API key. Anyone else is told to
   ask the owner for an invite.

## Shortlinks and the change log

- Every page or block gets a permanent `{server}/p/{id}`: 8 characters from
  `23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz`, unique (a colliding id is retried). It's keyed by graph
  + `rootUid`, so unpublishing and republishing keeps the same link.
- `/p/{id}`: the graph's owner and members see where the page lives (graph and collection URLs, listing, access) with
  copy buttons. Anyone else is redirected (307) to the page's main URL (as in `url` above), whose own access rules
  apply. Unpublished, removed or unknown → 404 for them.
- The extension writes the shortlink block, `{shortUrl} {tag}` (tag from its settings, default `#published`), as the
  first or last child of the published page or block, and sends its uid as `anchorUid`.
- With a stored token, the server appends one dated block per event under the anchor with the Append API
  (`location: { block: { uid: anchorUid } }`), e.g. `[[October 2nd, 2026]] 14:03 Republished`. Events: published,
  republished, byline changed, unpublished, visibility and Discover, shown in or hidden from the graph, added to or
  removed from a collection, access and passwords, collection deleted, and moderator removal or restore. Writes happen
  after the response and never fail the request. A 401/403 from Roam marks the token invalid (the dashboard asks
  for a new one). A 400 clears `anchorUid` until the extension writes a new block.

## Members, invites and transfers

- The owner invites people by email to a graph or collection. Only accounts with a verified email and a verified
  graph of their own (their personal graph) can be invited. Nothing changes until the invitee accepts.
- Graph members get their own API key and manage the pages they publish; the owner manages every page.
- The owner can offer ownership to a member. When the member accepts, they become the owner and the old owner stays
  on as a member. Removing a member revokes their key for that graph; their pages stay.

## Public URLs

`{server}/{graphName}/{rootUid}/{slug}` — e.g. `roam.pub/ejqs/xyz123123/this-is-why-something`.
Only `graphName` + `rootUid` identify the publication; the trailing slug is derived from the current title, is purely decorative, and is optional. A bare `/{graph}/{rootUid}` is served as-is; any slug that doesn't match the current title 307-redirects to the current one, so links survive page renames.

## Visibility

- `unlisted` (default): reachable by direct link only, always `noindex`.
- `public`: also listed on the graph's front page at `{server}/{graphName}` (when the graph's front page is on), and indexable unless the graph turned indexing off. If the owner turned on the graph's RSS feed, open public pages also appear in `{server}/{graphName}/feed.xml`.

Public pages can also be listed on `{server}/discover`. Each page has its own setting, changed on the dashboard. A new publication starts from the graph's "List new pages on Discover" setting (off by default); changing that setting never affects existing pages. Discover only lists pages from live graphs with the front page and search engine indexing on. The extension API doesn't expose this setting. The newest Discover pages are also in `{server}/discover/feed.xml`.

## RSS feeds (website only)

- `/discover/feed.xml` — always on: the 50 newest pages on Discover.
- `/{graphName}/feed.xml` — off by default (graph setting "RSS feed"). Needs the front page on and `indexAccess` `open`. Lists open, public, live pages in the graph.
- `/c/{slug}/feed.xml` — off by default (collection setting "RSS feed"). Needs `indexAccess` `open`. Lists open, listed pages in the collection.

Feed readers send no cookies, so feeds never include password-protected, members-only, unlisted or removed pages. A feed that is off, or whose front page isn't open, returns `404`. Items carry the title, link, date, a plain-text excerpt and, where bylines are on, the author. The extension API doesn't expose any of this.

## Places and access (website only)

A publication can appear in its graph (`/{graph}/{rootUid}/{slug}`, while `inGraph`) and/or in any number of
collections (`/c/{entryUid}/{slug}`, where `entryUid` is random, so pages from different graphs never clash).
Collections live at `/c/{slug}`; slugs and entry uids share one namespace. `/collection/…` redirects to `/c/…`.

Graphs and collections have `indexAccess` (who can open their front page) and `defaultAccess` (what their pages use),
each `open`, `password` or `members`, plus an optional shared password. Each place has its own `access`
(`inherit` or one of those), which replaces the default rather than stacking on it, and an optional password of its
own. Password-protected and members-only pages are never on Discover, never in RSS feeds, never indexed, and show a lock icon where they
are listed. Bylines (`showAuthors` on the graph or collection, overridable per place) show the extension's Author
name, else the publisher's public @username.

None of this is exposed to the extension.
