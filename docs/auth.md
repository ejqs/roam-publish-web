# Auth

## Prototype flow

1. User creates a Roam **append-only** (or higher) graph token.
2. Extension `POST /api/auth/exchange` with `{ roamToken, graphName }`.
3. Server validates the token via Roam Append API, creates/finds a synthetic user + `graph` row, issues a Better Auth API key with `metadata.graphName`.
4. Extension stores the API key and uses it for `/api/publish*`.

## Env

- `BETTER_AUTH_SECRET` — required in production
- `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` — public site origin
- `ROAM_TOKEN_VALIDATION=skip` — skip live Roam check (local only)

## Side effect

Successful exchange appends a short block under page **Roam Publish** / nest-under **Auth checks** in the user’s graph.

## Teams / groups

Not used. Settings UI does not offer team management.
