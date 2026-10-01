# Roam Publish — Extension ↔ Server Contract

Both `roam-publish` (extension) and `roam-publish-web` (server) implement this. Keep them in sync.

## Canonical content + hash

```ts
type Node = { uid: string; string: string; heading?: 1 | 2 | 3; children: Node[] };
type PublishPayload = { rootUid: string; kind: "page" | "block"; title: string; tree: Node };
```

- `children` ordered by `:block/order` ascending.
- `heading` omitted when absent/0.
- For a **page**, the root node is `{ uid: pageUid, string: "", children: [top-level blocks] }`.
- For a **block**, the root node is the block itself (with its string) and its children.
- Block refs `((uid))` are **inlined** by the extension before hashing (resolved text, max depth 3; unknown refs stay as-is).
- `contentHash = hex(sha256(stableStringify({ kind, title, tree })))`.
- `stableStringify`: JSON with object keys sorted recursively, no whitespace, `undefined` keys dropped. Implementation lives in `stable-stringify.ts` in each repo (identical copies).

## Auth

- Extension requests carry `x-api-key: rp_…` (better-auth api-key plugin, metadata `{ graphId }`).
- One key per verified graph.

## Endpoints (base: server URL)

All responses are JSON. Errors: `{ error: string }` with 4xx/5xx.

### `POST /api/ext/claim` (no auth)
Body `{ graphName, code }` → `200 { apiKey, graphName }`.
`400` bad body · `404` no matching pending verification (wrong/expired/used) · `429` too many attempts.

### `GET /api/ext/publications`
→ `200 { publications: [{ rootUid, kind, title, url, contentHash, updatedAt }] }` for the key's graph.

### `POST /api/ext/publications`
Body `PublishPayload & { contentHash }` → `200 { status: "created" | "updated" | "unchanged", url, contentHash }`.
`400` invalid body or hash mismatch · `401` bad key · `413` payload too large (> 1 MB).

### `DELETE /api/ext/publications/:rootUid`
→ `200 { deleted: true }` · `404` not published.

## CORS

Allowed origins: `https://roamresearch.com`, plus `http://localhost:*` in dev. Allowed headers: `content-type, x-api-key`. Methods: `GET, POST, DELETE, OPTIONS`.

## Graph verification

1. Web onboarding (logged in) takes `graphName` + append-only Roam token + browser-local date.
2. Server generates `code = base64url(randomBytes(32))` (43 chars), stores `sha256(code)`, expires in 15 min.
3. Server appends to that day's daily note via Roam Append API:
   `verify-roam-publish (deletable after onboarding): <code>`
4. Extension finds the block (regex `/verify-roam-publish[^:]*:\s*([A-Za-z0-9_-]{43})/`) and calls `/api/ext/claim` with `roamAlphaAPI.graph.name`.

## Public URLs

`{server}/{graphName}/{rootUid}/{slug}` — e.g. `roam.pub/ejqs/xyz123123/this-is-why-something`.
Only `graphName` + `rootUid` identify the publication; the trailing slug is derived from the current title, is purely decorative, and is optional (any value resolves). Links therefore survive page renames.
