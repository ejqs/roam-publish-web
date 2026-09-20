# API contract

Canonical copy for this repo. The Project store also has
`/cursor/stores/bc-9c71aa00-2fcb-42f5-a280-6138b8e204ee/docs/api-contract.md`
— keep them aligned when behavior changes.

**Production base URL:** `https://roampub.up.railway.app`

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/exchange` | none (Roam token in body) | Roam append token → site API key |
| `POST` | `/api/publish` | Bearer API key | Upsert page/block |
| `GET` | `/api/publish` | Bearer API key | List publications |
| `GET` | `/api/publish/{uid}` | Bearer API key | Get one (incl. content) |
| `PATCH` | `/api/publish/{uid}` | Bearer API key | Patch visibility/title/scope |
| `DELETE` | `/api/publish/{uid}` | Bearer API key | Unpublish |
| `GET` | `/{graphName}/{uid}` | none | Public/unlisted HTML render |
| `GET` | `/{graphName}` | none | Public listing |

Also accepts `x-api-key` instead of `Authorization: Bearer`.

CORS is enabled on API routes for browser extension calls.

See the full request/response shapes in the Project store `api-contract.md` (mirrored intent below).

### Exchange body

```json
{ "roamToken": "roam-graph-token-…", "graphName": "ejqs-develop" }
```

### Publish body

```json
{
  "uid": "…",
  "kind": "page",
  "title": "…",
  "content": { "format": "roam-json-v1", "children": [] },
  "visibility": "unlisted",
  "scope": "tree",
  "contentFingerprint": "…"
}
```

No teams/groups fields.
