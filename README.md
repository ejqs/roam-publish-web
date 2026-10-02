# Roam Publish — web

Server and website for [Roam Publish](https://github.com/ejqs/roam-publish), a Roam Research extension that publishes
pages and blocks to the web.

For how the server and extension work together (the contract, shared invariants, trust boundary, and how to ship
changes across both), see [roam-publish-docs](https://github.com/ejqs/roam-publish-docs).

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

## RSS feeds

- `/discover/feed.xml`: always on, the newest pages on Discover.
- `/{graph}/feed.xml`: off by default; owners turn it on in graph settings. Needs the front page on and open to everyone.
- `/c/{slug}/feed.xml`: off by default; owners turn it on in collection settings. Needs the collection page open to everyone.

Feed readers send no cookies, so feeds only ever list pages open to everyone (see `src/lib/feeds.ts`).

## Deletion

Owners delete a graph in its settings, and themselves at the bottom of the dashboard. Deleting an account goes
through better-auth's `deleteUser` with an email confirmation; `src/lib/deletion.ts` deletes everything first.
Deleting can't be a way out of a moderation action:

- A graph that's suspended or has a removed page can't be deleted on its own.
- When an account is deleted after a moderator acted on it, its email (hashed), graph names and usernames go on
  the `blocked_identity` blocklist, and its suspended collections keep their slugs. Sign-up, graph verification
  and username claims check the blocklist. Admins lift entries at `/admin/blocked`.

## Extension API

See [docs/api-contract.md](docs/api-contract.md), and [roam-publish-docs](https://github.com/ejqs/roam-publish-docs)
for the reasoning behind it.

---

This is a third-party service made by [@ejqs](https://ejqs.net). Not affiliated with Roam Research.
