# Build and deploy

## Local

```bash
bun install
cp .env.example .env.local   # fill DATABASE_URL + BETTER_AUTH_*
bun run db:migrate           # applies publish-domain SQL
bun run dev
```

## Scripts

| Script | Purpose |
| --- | --- |
| `bun run dev` | Next.js dev server |
| `bun run build` / `start` | Production |
| `bun run db:migrate` | Apply `db/drizzle/**/migration.sql` in order |

## Railway

- Project: **roam-pub**
- Service: **roam-publish-web**
- Domain: https://roampub.up.railway.app
- Deploys from GitHub `main` by default
- Required vars: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`

Prototype feature work ships on branch `cursor/prototype-publish-api-cd9d`; merge to `main` (or temporarily point Railway at the branch) to publish.
