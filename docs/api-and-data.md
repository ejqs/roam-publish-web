# API and data

## Tables (prototype)

### `graph`

| Column | Notes |
| --- | --- |
| `id` | UUID |
| `name` | Unique; Roam graph name = URL slug |
| `user_id` | FK → Better Auth `user` |

### `publication`

| Column | Notes |
| --- | --- |
| `graph_id` + `uid` | Unique pair |
| `kind` | `page` \| `block` |
| `title` | Display title |
| `content` | JSONB (`roam-json-v1` or `markdown`) |
| `visibility` | `public` \| `unlisted` \| `private` |
| `scope` | `self` \| `tree` (blocks) |
| `status` | `published` |
| `content_fingerprint` | Optional drift hash |

No teams/groups tables.

## Migrations

SQL lives in `db/drizzle/20260920160000_publish_domain/migration.sql`. Apply against Postgres (see [build-and-deploy.md](./build-and-deploy.md)).
