# roam-publish-web

Publish and share Roam pages and blocks.

Pairs with [roam-publish](https://github.com/ejqs/roam-publish) (Depot extension).

## Prototype slice

- `POST /api/auth/exchange` — Roam append-only token → API key
- ` /api/publish*` — API-key authenticated upsert/list/get/patch/delete
- `/{graphName}/{uid}` — render published content
- No teams/groups

See [docs/](./docs/) and especially [docs/api-contract.md](./docs/api-contract.md).

## Stack

- Next.js, Drizzle, Postgres, Better Auth, shadcn/ui, Railway

## Quick start

```bash
bun install
cp .env.example .env.local
bun run db:migrate
bun run dev
```

Production: https://roampub.up.railway.app
