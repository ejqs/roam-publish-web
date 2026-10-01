# Roam Publish — web

Server and website for [Roam Publish](https://github.com/ejqs/roam-publish), a Roam Research extension that publishes
pages and blocks to the web.

Stack: Bun · Next.js (App Router) · shadcn/ui (Blueprint-styled) · better-auth (+ api-key plugin) · Drizzle · Postgres · Resend.

## Develop

```bash
bun install
cp .env.example .env.local   # fill in BETTER_AUTH_SECRET (openssl rand -base64 32)
bun run db:migrate
bun dev
```

Without `RESEND_API_KEY`, verification and reset emails are printed to the server console.

## Schema changes

Edit `src/db/app-schema.ts` (or re-run `bunx auth@latest generate --config src/lib/auth.ts --output src/db/auth-schema.ts`
after changing better-auth plugins), then `bun run db:generate` and commit the migration in `drizzle/`.

## Extension API

See [docs/api-contract.md](docs/api-contract.md).

---

This is a third-party service made by [@ejqs](https://ejqs.net). Not affiliated with Roam Research.
