# Roam Publish — web

Server and website for [Roam Publish](https://github.com/ejqs/roam-publish), a Roam Research extension that publishes
pages and blocks to the web.

For how the server and extension work together (the contract, shared invariants, trust boundary, and how to ship
changes across both), see [roam-publish-docs](https://github.com/ejqs/roam-publish-docs).

Stack: Bun · Next.js (App Router) · shadcn/ui (Blueprint-styled) · better-auth (+ api-key plugin) · Drizzle · Postgres · Resend.

## Develop

```bash
bun install
cp .env.example .env.local   # fill in BETTER_AUTH_SECRET and APPEND_TOKEN_KEY (openssl rand -base64 32 each)
bun run db:migrate
bun dev
```

Without `RESEND_API_KEY`, verification and reset emails are printed to the server console.

## Tests

```bash
bun run test
```

Unit tests (`tests/unit`) need nothing. Integration tests (`tests/integration`) run against a real Postgres: they
create and migrate `TEST_DATABASE_URL` (default `postgres://postgres@localhost:5433/roam_publish_test`) and empty it
before each test, so never point it at a database you care about. Next's request APIs (`headers`, `cookies`, `after`,
cache revalidation) are stubbed in `tests/helpers/preload.ts`; Roam's Append API and email are never called.

A `test.failing` is a known bug: it passes while the bug is there, and fails once it's fixed, so swap it for `test`.
CI runs typecheck, lint and the tests on every PR.

## Branch workflow

1. Push changes to `develop` first. Railway's `staging` environment (the shadow database) deploys it. Its pre-deploy step (`bun run staging:check`) runs the full test suite against a throwaway `roam_publish_test` database on the staging Postgres, then migrates staging. Wait for that deploy to succeed.
2. Only then open a PR from `develop` into `main`.
3. Repeat for every later change; `develop` is always the staging branch for `main`.

## Schema changes

Edit `src/db/app-schema.ts` (or re-run `bunx auth@latest generate --config src/lib/auth.ts --output src/db/auth-schema.ts`
after changing better-auth plugins), then `bun run db:generate` and commit the migration in `drizzle/`.

## Tags and search

Tags and search text are derived from each page's tree on publish (`src/lib/tags.ts`). After deploying migration
`0018_search_and_tags`, or after changing how tags are extracted, run `railway run bun run search:backfill` once so
existing pages get them.

## RSS feeds

- `/discover/feed.xml`: always on, the newest pages on Discover.
- `/{graph}/feed.xml`: off by default; owners turn it on in graph settings. Needs the front page on and open to everyone.
- `/c/{slug}/feed.xml`: off by default; owners turn it on in collection settings. Needs the collection page open to everyone.

Feed readers send no cookies, so feeds only ever list pages open to everyone (see `src/lib/feeds.ts`).

## Stored Roam tokens (change log)

Graph owners' append-only tokens are stored AES-256-GCM encrypted with `APPEND_TOKEN_KEY` (`src/lib/append-token.ts`)
and only used to append the change log under shortlink blocks. Without the key, nothing is stored and the change log
is off.

**Rotating the key** (e.g. it leaked, but the database didn't):

1. Set `APPEND_TOKEN_KEY_PREVIOUS` to the old key and `APPEND_TOKEN_KEY` to a new one (`openssl rand -base64 32`),
   then deploy. Tokens encrypted with either key keep working.
2. Run `railway run bun run tokens:rotate` to re-encrypt every token with the new key.
3. Remove `APPEND_TOKEN_KEY_PREVIOUS` and deploy.

**If the key and the database may both have leaked**, treat the stored tokens as exposed: set a new key, deploy, and
run `railway run bun run tokens:revoke-all`. Every owner gets a dashboard banner asking for a new token; tell them to
revoke the old one in Roam (Settings → Graph → API tokens). An append-only token can only add blocks to its own graph.

Changing the key without `tokens:rotate` doesn't break anything: tokens the server can no longer read are marked
invalid the next time they're needed, and owners are asked for a new one.

## Deletion

Owners delete a graph in its settings, and themselves at the bottom of the dashboard. Deleting an account goes
through better-auth's `deleteUser` with an email confirmation; `src/lib/deletion.ts` deletes everything first.
Deleting can't be a way out of a moderation action:

- A graph that's suspended or has a removed page can't be deleted on its own.
- When an account is deleted after a moderator acted on it, its email (hashed), graph names and usernames go on
  the `blocked_identity` blocklist, and its suspended collections keep their slugs. Sign-up, graph verification
  and username claims check the blocklist. Admins lift entries at `/admin/blocked`.

## Monitoring

Every route handler, server action and call to an outside service (Roam's Append API, Umami, Resend) is timed by
`src/lib/telemetry.ts`; page render errors come in through `onRequestError` in `src/instrumentation.ts`. Counts,
errors and a latency histogram are kept per minute in memory, saved to `endpoint_metric` by the `metrics-flush` job
and kept two weeks.

- **`/admin/status`**: health, then calls, error rate, p50/p95/max and the last error for each entry point over
  the last hour, day or week. Rows past 2% errors or a slow p95 (2 s, 5 s for outside services) are flagged.
- **`GET /api/health`**: `200 {"status":"ok"}` while the database answers and the job worker has written a
  heartbeat in the last three minutes, else `503 {"status":"degraded","checks":{...}}`. Point Railway's
  healthcheck or an uptime monitor at it.
- **Rejected**: 4xx answers are counted per status (e.g. `409 ×38`) next to errors, not as errors. A route where
  over a quarter of 20+ calls are refused is flagged too: that's usually our bug, like the content hash drifting.
- **Failure emails**: the `status-alerts` job checks the last 15 minutes every 5 minutes and emails a digest when
  something starts failing, a reminder every 6 hours while it lasts, and an all-clear when it's fixed. It counts
  3+ errors over 2% of calls, a slow p95 over 10+ calls, a mostly-refused route, or a failing, overdue or stalled job.
  It goes to every user with better-auth's `admin` role; `ALERTS=off` stops it. It needs the
  database and Resend, so pair it with an uptime monitor on `/api/health` for outages.
- **Logs**: each failure or call over a second is one JSON line on stdout
  (`{"level":"error","metric":"GET /api/search","ms":…,"error":…}`); search Railway's logs with `@metric:…`.

A new route handler must wrap each method in `withRoute(...)`, and a new server action its body in
`return withAction(...)`; `tests/unit/entry-points.test.ts` fails otherwise. A thrown error or 5xx is a failure;
an `{ ok: false }` result or a 4xx isn't. Page timings aren't recorded: Railway's HTTP metrics have them.

## Extension API

See [docs/api-contract.md](docs/api-contract.md), and [roam-publish-docs](https://github.com/ejqs/roam-publish-docs)
for the reasoning behind it.

---

This is a third-party service made by [@ejqs](https://ejqs.net). Not affiliated with Roam Research.

The code is licensed under the [MIT License](LICENSE).

The site icon (🌍) and header logo (🌍📝) are from [Twemoji](https://github.com/jdecked/twemoji), © Twitter, Inc
and other contributors, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). They are used
unmodified: the icon is rendered to PNG and ICO in `src/app/`, and the logo images are in `public/emoji/`.
